<?php

namespace App\Support;

use App\Models\CleaningProject;
use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CompanyRemittanceSupport
{
    public const OVERDUE_DAYS = 14;

    public const REMIND_SNOOZE_DAYS = 7;

    public static function syncForReport(DailyReport $report): void
    {
        $report->loadMissing('dailySchedule.cleaningProject');

        $project = $report->dailySchedule?->cleaningProject;

        if ($project && (bool) $project->expects_company_remittance) {
            self::syncForProject($project);

            return;
        }

        self::syncStandaloneReport($report);
    }

    public static function syncForProject(CleaningProject $project): void
    {
        $project->loadMissing(['schedules.dailyReport', 'schedules.user']);

        if (! (bool) $project->expects_company_remittance) {
            self::purgeProjectRemittances($project);

            return;
        }

        $reports = self::projectReports($project);

        if ($reports->isEmpty()) {
            self::purgeProjectRemittances($project);

            return;
        }

        if (self::hasActiveSplitGroup($project)) {
            return;
        }

        $amount = self::projectRemittanceAmount($project);

        if ($amount <= 0) {
            self::purgeProjectRemittances($project);

            return;
        }

        $canonical = self::canonicalProjectReport($reports);
        $expectedDate = $project->planned_end_date
            ?? $canonical->dailySchedule?->work_date
            ?? now()->toDateString();

        $remittance = CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->orderBy('id')
            ->first();

        if (! $remittance) {
            $remittance = new CompanyRemittance([
                'report_id' => $canonical->id,
                'cleaning_project_id' => $project->id,
            ]);
        }

        CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->where('id', '!=', $remittance->id ?? 0)
            ->delete();

        CompanyRemittance::query()
            ->whereIn('report_id', $reports->pluck('id'))
            ->where(function (Builder $query) use ($project, $remittance) {
                $query->whereNull('cleaning_project_id')
                    ->orWhere('cleaning_project_id', '!=', $project->id);
            })
            ->when($remittance->exists, fn (Builder $query) => $query->where('id', '!=', $remittance->id))
            ->delete();

        $remittance->report_id = $canonical->id;
        $remittance->cleaning_project_id = $project->id;
        $remittance->amount = $amount;

        if (! $remittance->exists) {
            $remittance->status = CompanyRemittance::STATUS_PENDING;
        }

        if ($remittance->expected_remittance_date === null) {
            $remittance->expected_remittance_date = Carbon::parse($expectedDate)->toDateString();
        }

        $remittance->save();
    }

    public static function syncForMonth(int $year, int $month): void
    {
        self::healProjectRemittanceReports($year, $month);

        $reports = DailyReport::query()
            ->with(['dailySchedule.cleaningProject'])
            ->where('paid_to_company', true)
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)->whereMonth('work_date', $month);
            })
            ->get();

        $projectIds = collect();

        foreach ($reports as $report) {
            $projectId = $report->dailySchedule?->cleaning_project_id;

            if ($projectId) {
                $projectIds->push($projectId);

                continue;
            }

            self::syncStandaloneReport($report);
        }

        CleaningProject::query()
            ->whereIn('id', $projectIds->unique()->values())
            ->get()
            ->each(fn (CleaningProject $project) => self::syncForProject($project));
    }

    public static function healProjectRemittanceReports(int $year, int $month): void
    {
        $projectIds = collect();

        DailyReport::query()
            ->with(['dailySchedule.cleaningProject'])
            ->where('paid_to_company', false)
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)
                    ->whereMonth('work_date', $month)
                    ->whereHas('cleaningProject', fn ($project) => $project->where('expects_company_remittance', true));
            })
            ->get()
            ->each(function (DailyReport $report) use ($projectIds) {
                EmployeeReportSupport::resyncFromSchedule(
                    $report,
                    ['paid_to_company' => true],
                    false,
                );

                if ($report->dailySchedule?->cleaning_project_id) {
                    $projectIds->push($report->dailySchedule->cleaning_project_id);
                }
            });

        CleaningProject::query()
            ->whereIn('id', $projectIds->unique()->values())
            ->get()
            ->each(fn (CleaningProject $project) => self::syncForProject($project));
    }

    /**
     * @return array{original: CompanyRemittance, split: CompanyRemittance}
     */
    public static function split(CompanyRemittance $remittance, int $splitAmount, ?string $expectedRemittanceDate = null): array
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            throw new \InvalidArgumentException('已入帳的匯款紀錄不可拆帳');
        }

        if ($splitAmount < 1 || $splitAmount >= (int) $remittance->amount) {
            throw new \InvalidArgumentException('拆分金額需大於 0 且小於原匯款金額');
        }

        $remittance->loadMissing('report.dailySchedule.cleaningProject');
        $projectId = self::resolveCleaningProjectId($remittance);

        $remittance->amount = (int) $remittance->amount - $splitAmount;
        $remittance->save();

        $split = CompanyRemittance::query()->create([
            'report_id' => $remittance->report_id,
            'cleaning_project_id' => $projectId,
            'amount' => $splitAmount,
            'status' => CompanyRemittance::STATUS_PENDING,
            'expected_remittance_date' => $expectedRemittanceDate
                ?? $remittance->expected_remittance_date?->toDateString(),
        ]);

        if ($projectId) {
            self::assertSplitGroupTotal(CleaningProject::query()->find($projectId));
        }

        return [
            'original' => $remittance->fresh(),
            'split' => $split->fresh(),
        ];
    }

    public static function dedupeProjectRemittances(
        CleaningProject $project,
        bool $dryRun = false,
        ?callable $onWouldFix = null,
    ): bool {
        $project->loadMissing(['schedules.dailyReport']);
        $reports = self::projectReports($project);

        if ($reports->isEmpty()) {
            return false;
        }

        if (self::hasActiveSplitGroup($project)) {
            return false;
        }

        $remittances = CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->orderBy('id')
            ->get();

        if ($remittances->count() <= 1) {
            return false;
        }

        if ($dryRun) {
            $onWouldFix && $onWouldFix();

            return true;
        }

        $canonical = self::canonicalProjectReport($reports);
        $targetAmount = self::projectRemittanceAmount($project);
        $primary = $remittances->firstWhere('report_id', $canonical->id)
            ?? $remittances->sortBy('id')->first();

        CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->where('id', '!=', $primary->id)
            ->delete();

        $primary->report_id = $canonical->id;
        $primary->cleaning_project_id = $project->id;
        $primary->amount = $targetAmount;

        if ($primary->expected_remittance_date === null) {
            $primary->expected_remittance_date = $project->planned_end_date
                ?? $canonical->dailySchedule?->work_date;
        }

        $primary->save();

        CompanyRemittance::query()
            ->whereIn('report_id', $reports->pluck('id'))
            ->where(function (Builder $query) use ($project) {
                $query->whereNull('cleaning_project_id')
                    ->orWhere('cleaning_project_id', '!=', $project->id);
            })
            ->delete();

        return true;
    }

    public static function projectRemittanceAmount(CleaningProject $project): int
    {
        $lines = SchedulePricing::normalizeLines(
            $project->pricing_lines,
            (int) $project->ac_units,
            (int) $project->unit_price,
        );

        return (int) SchedulePricing::summarizeLines($lines, (bool) $project->needs_invoice)['cleaning_price'];
    }

    /**
     * @return array{
     *     total_amount:int,
     *     employee_received:int,
     *     company_inbound_amount:int|null,
     *     collect_from_employee:int,
     *     advance_to_employee:int
     * }
     */
    public static function financialBreakdown(DailyReport $report): array
    {
        $report->loadMissing('dailySchedule');
        $schedule = $report->dailySchedule;

        if (! $schedule) {
            return [
                'total_amount' => (int) $report->collected_amount,
                'employee_received' => (int) $report->collected_amount,
                'company_inbound_amount' => null,
                'collect_from_employee' => 0,
                'advance_to_employee' => 0,
            ];
        }

        $lines = SchedulePricing::normalizeLines(
            $schedule->pricing_lines,
            $schedule->ac_units,
            $schedule->unit_price
        );

        $summary = EmployeeRemittance::summarizeReport(
            $lines,
            (int) $report->completed_units,
            (int) $schedule->ac_units,
            (bool) $report->paid_to_company,
            (bool) $report->has_tax
                || (bool) $report->needs_invoice_and_mail
                || (bool) $schedule->needs_invoice,
        );

        if ($report->paid_to_company) {
            return [
                'total_amount' => (int) $summary['company_transfer'],
                'employee_received' => 0,
                'company_inbound_amount' => (int) $summary['company_transfer'],
                'collect_from_employee' => 0,
                'advance_to_employee' => (int) $summary['advance_to_employee'],
            ];
        }

        return [
            'total_amount' => max((int) $report->collected_amount, (int) $summary['collect_from_employee']),
            'employee_received' => (int) $report->collected_amount,
            'company_inbound_amount' => null,
            'collect_from_employee' => (int) $summary['collect_from_employee'],
            'advance_to_employee' => 0,
        ];
    }

    public static function countsTowardHongyiAccount(DailyReport $report): bool
    {
        if (! $report->paid_to_company) {
            return false;
        }

        return self::confirmedRemittanceAmountForReport($report) > 0;
    }

    public static function confirmedRemittanceAmountForReport(DailyReport $report): int
    {
        $report->loadMissing('dailySchedule.cleaningProject');
        $project = $report->dailySchedule?->cleaningProject;

        if ($project && (bool) $project->expects_company_remittance) {
            return (int) CompanyRemittance::query()
                ->where('cleaning_project_id', $project->id)
                ->where('status', CompanyRemittance::STATUS_CONFIRMED)
                ->sum('amount');
        }

        return (int) CompanyRemittance::query()
            ->where('report_id', $report->id)
            ->where('status', CompanyRemittance::STATUS_CONFIRMED)
            ->sum('amount');
    }

    public static function expectedRemittanceAnchor(CompanyRemittance $remittance): ?Carbon
    {
        if ($remittance->expected_remittance_date !== null) {
            return Carbon::parse($remittance->expected_remittance_date)->startOfDay();
        }

        return $remittance->created_at?->copy()->startOfDay();
    }

    public static function isAlertSnoozed(CompanyRemittance $remittance): bool
    {
        if (! Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            return false;
        }

        return $remittance->alert_snooze_until !== null
            && $remittance->alert_snooze_until->isFuture();
    }

    public static function snoozeAlertUntil(CompanyRemittance $remittance, ?Carbon $until = null): void
    {
        if (! Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            return;
        }

        $remittance->alert_snooze_until = $until ?? now()->addDays(self::REMIND_SNOOZE_DAYS);
        $remittance->save();
    }

    public static function isOverdue(CompanyRemittance $remittance): bool
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            return false;
        }

        if (self::isAlertSnoozed($remittance)) {
            return false;
        }

        $now = now()->copy()->startOfDay();

        if ($remittance->status === CompanyRemittance::STATUS_REMINDED) {
            if ($remittance->reminded_at === null) {
                return false;
            }

            $anchor = $remittance->reminded_at->copy()->startOfDay();

            return $anchor->copy()->addDays(self::REMIND_SNOOZE_DAYS)->lte($now);
        }

        $anchor = self::expectedRemittanceAnchor($remittance);

        return $anchor !== null
            && $anchor->copy()->addDays(self::OVERDUE_DAYS)->lte($now);
    }

    /**
     * @return Builder<CompanyRemittance>
     */
    public static function overdueQuery(): Builder
    {
        self::prepareAlertRemittances();
        self::healDuplicateOverdueRemittances();
        self::healMissingRemindedAt();
        self::healRecentRemindedSnooze();

        $now = now();
        $pendingCutoff = $now->copy()->subDays(self::OVERDUE_DAYS)->toDateString();
        $remindedCutoff = $now->copy()->subDays(self::REMIND_SNOOZE_DAYS)->startOfDay();

        $query = CompanyRemittance::query()
            ->with([
                'report.dailySchedule.user:id,name,account',
            ]);

        if (Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            $query->where(function (Builder $builder) {
                $builder->whereNull('alert_snooze_until')
                    ->orWhere('alert_snooze_until', '<=', now());
            });
        }

        return $query->where(function (Builder $builder) use ($pendingCutoff, $remindedCutoff) {
            $builder->where(function (Builder $pending) use ($pendingCutoff) {
                $pending->where('status', CompanyRemittance::STATUS_PENDING)
                    ->whereRaw('COALESCE(expected_remittance_date, date(created_at)) <= ?', [$pendingCutoff]);
            })->orWhere(function (Builder $reminded) use ($remindedCutoff) {
                $reminded->where('status', CompanyRemittance::STATUS_REMINDED)
                    ->whereNotNull('reminded_at')
                    ->where('reminded_at', '<=', $remindedCutoff);
            });
        });
    }

    public static function prepareAlertRemittances(): void
    {
        $projectIds = CompanyRemittance::query()
            ->where('status', '!=', CompanyRemittance::STATUS_CONFIRMED)
            ->get()
            ->map(function (CompanyRemittance $remittance) {
                if ($remittance->cleaning_project_id) {
                    return (int) $remittance->cleaning_project_id;
                }

                $remittance->loadMissing('report.dailySchedule');

                return (int) ($remittance->report?->dailySchedule?->cleaning_project_id ?? 0);
            })
            ->filter()
            ->unique()
            ->values();

        if ($projectIds->isEmpty()) {
            return;
        }

        CleaningProject::query()
            ->whereIn('id', $projectIds)
            ->where('expects_company_remittance', true)
            ->get()
            ->each(function (CleaningProject $project) {
                self::syncForProject($project);
                self::dedupeProjectRemittances($project);
            });
    }

    /**
     * @param  list<int>|array<int, int>  $remittanceIds
     * @return list<int>
     */
    public static function expandRemittanceIdsForAlertAction(array $remittanceIds): array
    {
        $expanded = collect($remittanceIds);

        CompanyRemittance::query()
            ->whereIn('id', $remittanceIds)
            ->with(['report.dailySchedule'])
            ->get()
            ->each(function (CompanyRemittance $seed) use (&$expanded) {
                $projectId = (int) ($seed->cleaning_project_id
                    ?: $seed->report?->dailySchedule?->cleaning_project_id
                    ?: 0);

                if ($projectId <= 0) {
                    return;
                }

                $reportIds = DailyReport::query()
                    ->whereHas('dailySchedule', fn (Builder $query) => $query->where('cleaning_project_id', $projectId))
                    ->pluck('id');

                $siblingIds = CompanyRemittance::query()
                    ->where('status', '!=', CompanyRemittance::STATUS_CONFIRMED)
                    ->where(function (Builder $query) use ($projectId, $reportIds) {
                        $query->where('cleaning_project_id', $projectId);

                        if ($reportIds->isNotEmpty()) {
                            $query->orWhereIn('report_id', $reportIds);
                        }
                    })
                    ->pluck('id');

                $expanded = $expanded->merge($siblingIds);
            });

        return $expanded->unique()->map(fn ($id) => (int) $id)->values()->all();
    }

    public static function healDuplicateOverdueRemittances(): void
    {
        CompanyRemittance::query()
            ->with(['report.dailySchedule'])
            ->whereNull('cleaning_project_id')
            ->whereHas('report.dailySchedule', fn (Builder $query) => $query->whereNotNull('cleaning_project_id'))
            ->get()
            ->each(function (CompanyRemittance $orphan) {
                $projectId = $orphan->report?->dailySchedule?->cleaning_project_id;

                if (! $projectId) {
                    return;
                }

                $hasProjectRow = CompanyRemittance::query()
                    ->where('cleaning_project_id', $projectId)
                    ->exists();

                if ($hasProjectRow) {
                    $orphan->delete();
                }
            });

        $projectIds = CompanyRemittance::query()
            ->whereNotNull('cleaning_project_id')
            ->distinct()
            ->pluck('cleaning_project_id');

        foreach ($projectIds as $projectId) {
            $project = CleaningProject::query()->find($projectId);

            if (! $project) {
                continue;
            }

            $rowCount = CompanyRemittance::query()
                ->where('cleaning_project_id', $projectId)
                ->count();

            if ($rowCount <= 1) {
                continue;
            }

            if (self::hasActiveSplitGroup($project)) {
                continue;
            }

            self::dedupeProjectRemittances($project);
        }
    }

    public static function alertDedupeKey(CompanyRemittance $remittance): string
    {
        if ($remittance->cleaning_project_id) {
            return 'project:'.$remittance->cleaning_project_id;
        }

        return 'report:'.$remittance->report_id;
    }

    public static function healMissingRemindedAt(): void
    {
        $payload = ['reminded_at' => now()];

        if (Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            $payload['alert_snooze_until'] = now()->addDays(self::REMIND_SNOOZE_DAYS);
        }

        CompanyRemittance::query()
            ->where('status', CompanyRemittance::STATUS_REMINDED)
            ->whereNull('reminded_at')
            ->update($payload);
    }

    public static function healRecentRemindedSnooze(): void
    {
        if (! Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            return;
        }

        $recentCutoff = now()->subDays(self::REMIND_SNOOZE_DAYS);

        CompanyRemittance::query()
            ->where('status', CompanyRemittance::STATUS_REMINDED)
            ->whereNotNull('reminded_at')
            ->where('reminded_at', '>=', $recentCutoff)
            ->where(function (Builder $query) {
                $query->whereNull('alert_snooze_until')
                    ->orWhere('alert_snooze_until', '<', now());
            })
            ->get()
            ->each(function (CompanyRemittance $remittance) {
                $remittance->alert_snooze_until = $remittance->reminded_at
                    ->copy()
                    ->addDays(self::REMIND_SNOOZE_DAYS);
                $remittance->save();
            });
    }

    /**
     * @param  list<int>|array<int, int>  $remittanceIds
     */
    public static function dismissAlerts(array $remittanceIds): int
    {
        $remittanceIds = self::expandRemittanceIdsForAlertAction($remittanceIds);

        if ($remittanceIds === []) {
            return 0;
        }

        $snoozeUntil = now()->addDays(self::REMIND_SNOOZE_DAYS);
        $updated = 0;

        CompanyRemittance::query()
            ->whereIn('id', $remittanceIds)
            ->where('status', '!=', CompanyRemittance::STATUS_CONFIRMED)
            ->get()
            ->each(function (CompanyRemittance $remittance) use ($snoozeUntil, &$updated) {
                if ($remittance->status !== CompanyRemittance::STATUS_REMINDED) {
                    $remittance->status = CompanyRemittance::STATUS_REMINDED;
                }

                $remittance->reminded_at = now();

                if (Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
                    $remittance->alert_snooze_until = $snoozeUntil;
                }

                $remittance->save();
                $updated++;
            });

        return $updated;
    }

    public static function statusLabel(string $status): string
    {
        return match ($status) {
            CompanyRemittance::STATUS_PENDING => '待匯款',
            CompanyRemittance::STATUS_REMINDED => '已催繳',
            CompanyRemittance::STATUS_CONFIRMED => '已入帳',
            default => $status,
        };
    }

    /**
     * @return array<string, mixed>
     */
    public static function payload(CompanyRemittance $remittance): array
    {
        $remittance->loadMissing([
            'report.dailySchedule.user:id,name,account',
            'report.dailySchedule.cleaningProject.schedules.user:id,name',
            'cleaningProject.schedules.user:id,name',
        ]);

        $report = $remittance->report;
        $schedule = $report?->dailySchedule;
        $project = $remittance->cleaningProject ?? $schedule?->cleaningProject;
        $isProjectTotal = $project !== null && (bool) $project->expects_company_remittance;
        $groupMeta = self::splitGroupMeta($remittance, $project);

        $employeeName = $schedule?->user?->name;

        if ($isProjectTotal && $project) {
            $employeeName = $project->schedules
                ->pluck('user.name')
                ->filter()
                ->unique()
                ->values()
                ->join('、') ?: $employeeName;
        }

        return [
            'id' => $remittance->id,
            'report_id' => $remittance->report_id,
            'cleaning_project_id' => $project?->id,
            'project_code' => $project?->project_code,
            'is_project_total' => $isProjectTotal,
            'amount' => (int) $remittance->amount,
            'order_total_amount' => $groupMeta['order_total_amount'],
            'split_index' => $groupMeta['split_index'],
            'split_total_count' => $groupMeta['split_total_count'],
            'can_split' => $groupMeta['can_split'],
            'amount_mismatch' => $groupMeta['amount_mismatch'],
            'status' => $remittance->status,
            'status_label' => self::statusLabel($remittance->status),
            'is_overdue' => self::isOverdue($remittance),
            'expected_remittance_date' => $remittance->expected_remittance_date?->format('Y-m-d'),
            'reminded_at' => $remittance->reminded_at?->toDateTimeString(),
            'alert_snooze_until' => $remittance->alert_snooze_until?->toDateTimeString(),
            'confirmed_at' => $remittance->confirmed_at?->toDateTimeString(),
            'created_at' => $remittance->created_at?->toDateTimeString(),
            'work_date' => $isProjectTotal
                ? ($project?->planned_end_date?->format('Y-m-d') ?? (string) $project?->planned_end_date)
                : ($schedule?->work_date?->format('Y-m-d') ?? (string) $schedule?->work_date),
            'employee_name' => $employeeName,
            'customer_name' => $project?->customer_name ?? $schedule?->customer_name,
            'customer_address' => $project?->customer_address ?? $schedule?->customer_address,
            'customer_phone' => $project?->customer_phone ?? $schedule?->customer_phone,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function reportRemittancePayload(DailyReport $report): ?array
    {
        if (! $report->paid_to_company) {
            return null;
        }

        $report->loadMissing(['companyRemittance', 'dailySchedule.cleaningProject']);

        if ($report->dailySchedule?->cleaningProject?->expects_company_remittance) {
            $project = $report->dailySchedule->cleaningProject;
            $remittance = CompanyRemittance::query()
                ->where('cleaning_project_id', $project->id)
                ->orderBy('id')
                ->first();

            if (! $remittance) {
                return null;
            }

            return self::compactRemittancePayload($remittance);
        }

        $remittance = $report->companyRemittance;

        if (! $remittance) {
            return null;
        }

        return self::compactRemittancePayload($remittance);
    }

    /**
     * @return Builder<CompanyRemittance>
     */
    public static function monthQuery(int $year, int $month): Builder
    {
        return CompanyRemittance::query()
            ->where(function (Builder $query) use ($year, $month) {
                $query->where(function (Builder $dated) use ($year, $month) {
                    $dated->whereYear('expected_remittance_date', $year)
                        ->whereMonth('expected_remittance_date', $month);
                })->orWhere(function (Builder $fallback) use ($year, $month) {
                    $fallback->whereNull('expected_remittance_date')
                        ->whereHas('report.dailySchedule', function ($schedule) use ($year, $month) {
                            $schedule->whereYear('work_date', $year)
                                ->whereMonth('work_date', $month);
                        });
                });
            });
    }

    private static function syncStandaloneReport(DailyReport $report): void
    {
        $report->loadMissing('dailySchedule.cleaningProject');

        if ($report->dailySchedule?->cleaningProject?->expects_company_remittance) {
            self::syncForProject($report->dailySchedule->cleaningProject);

            return;
        }

        if (! $report->dailySchedule) {
            return;
        }

        if (! $report->paid_to_company) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();

            return;
        }

        if (self::hasActiveSplitGroupForReport($report)) {
            return;
        }

        $breakdown = self::financialBreakdown($report);
        $amount = (int) ($breakdown['company_inbound_amount'] ?? 0);

        if ($amount <= 0) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();

            return;
        }

        $existing = CompanyRemittance::query()->where('report_id', $report->id)->orderBy('id')->get();

        if ($existing->count() > 1) {
            $primary = $existing->first();
            CompanyRemittance::query()->where('report_id', $report->id)->where('id', '!=', $primary->id)->delete();
        }

        $remittance = CompanyRemittance::query()->firstOrNew(['report_id' => $report->id]);
        $remittance->amount = $amount;
        $remittance->cleaning_project_id = null;

        if (! $remittance->exists) {
            $remittance->status = CompanyRemittance::STATUS_PENDING;
            $workDate = $report->dailySchedule->work_date;

            if ($workDate !== null && $remittance->expected_remittance_date === null) {
                $remittance->expected_remittance_date = Carbon::parse($workDate)->toDateString();
            }
        }

        $remittance->save();
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     */
    private static function canonicalProjectReport(Collection $reports): ?DailyReport
    {
        return $reports
            ->sortBy(function (DailyReport $report) {
                $workDate = $report->dailySchedule?->work_date?->format('Y-m-d') ?? '9999-99-99';

                return $workDate.'-'.str_pad((string) $report->id, 10, '0', STR_PAD_LEFT);
            })
            ->first();
    }

    /**
     * @return Collection<int, DailyReport>
     */
    private static function projectReports(CleaningProject $project): Collection
    {
        return $project->schedules
            ->map(fn ($schedule) => $schedule->dailyReport)
            ->filter(fn ($report) => $report && $report->paid_to_company)
            ->values();
    }

    private static function purgeProjectRemittances(CleaningProject $project): void
    {
        CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->delete();

        $reportIds = DailyReport::query()
            ->whereHas('dailySchedule', fn ($query) => $query->where('cleaning_project_id', $project->id))
            ->pluck('id');

        if ($reportIds->isNotEmpty()) {
            CompanyRemittance::query()->whereIn('report_id', $reportIds)->delete();
        }
    }

    private static function hasActiveSplitGroup(CleaningProject $project): bool
    {
        return CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->count() > 1;
    }

    private static function hasActiveSplitGroupForReport(DailyReport $report): bool
    {
        return CompanyRemittance::query()
            ->where('report_id', $report->id)
            ->count() > 1;
    }

    private static function assertSplitGroupTotal(?CleaningProject $project): void
    {
        if (! $project) {
            return;
        }

        $expected = self::projectRemittanceAmount($project);
        $actual = (int) CompanyRemittance::query()
            ->where('cleaning_project_id', $project->id)
            ->sum('amount');

        if ($actual !== $expected) {
            return;
        }
    }

    private static function resolveCleaningProjectId(CompanyRemittance $remittance): ?int
    {
        if ($remittance->cleaning_project_id) {
            return (int) $remittance->cleaning_project_id;
        }

        return $remittance->report?->dailySchedule?->cleaning_project_id;
    }

    /**
     * @return array{
     *     order_total_amount:int|null,
     *     split_index:int|null,
     *     split_total_count:int|null,
     *     can_split:bool,
     *     amount_mismatch:bool
     * }
     */
    private static function splitGroupMeta(CompanyRemittance $remittance, ?CleaningProject $project): array
    {
        $groupQuery = $project
            ? CompanyRemittance::query()->where('cleaning_project_id', $project->id)
            : CompanyRemittance::query()->where('report_id', $remittance->report_id);

        $group = $groupQuery->orderBy('id')->get();
        $orderTotal = $project ? self::projectRemittanceAmount($project) : (int) $group->sum('amount');
        $groupSum = (int) $group->sum('amount');
        $index = $group->search(fn (CompanyRemittance $item) => $item->id === $remittance->id);

        return [
            'order_total_amount' => $orderTotal,
            'split_index' => $index === false ? null : $index + 1,
            'split_total_count' => $group->count(),
            'can_split' => $remittance->status !== CompanyRemittance::STATUS_CONFIRMED
                && (int) $remittance->amount > 1,
            'amount_mismatch' => $groupSum !== $orderTotal,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function compactRemittancePayload(CompanyRemittance $remittance): array
    {
        return [
            'id' => $remittance->id,
            'amount' => (int) $remittance->amount,
            'status' => $remittance->status,
            'status_label' => self::statusLabel($remittance->status),
            'is_overdue' => self::isOverdue($remittance),
            'confirmed_at' => $remittance->confirmed_at?->toDateTimeString(),
        ];
    }
}
