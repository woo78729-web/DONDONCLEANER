<?php

namespace App\Support;

use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

class CompanyRemittanceSupport
{
    public const OVERDUE_DAYS = 14;

    public const REMIND_SNOOZE_DAYS = 7;

    public static function syncForReport(DailyReport $report): void
    {
        $report->loadMissing('dailySchedule');

        if (! $report->dailySchedule) {
            return;
        }

        if (! $report->paid_to_company) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();

            return;
        }

        $breakdown = self::financialBreakdown($report);
        $amount = (int) ($breakdown['company_inbound_amount'] ?? 0);

        if ($amount <= 0) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();

            return;
        }

        $remittance = CompanyRemittance::query()->firstOrNew(['report_id' => $report->id]);
        $remittance->amount = $amount;

        if (! $remittance->exists) {
            $remittance->status = CompanyRemittance::STATUS_PENDING;
            $workDate = $report->dailySchedule->work_date;

            if ($workDate !== null && $remittance->expected_remittance_date === null) {
                $remittance->expected_remittance_date = Carbon::parse($workDate)->toDateString();
            }
        }

        $remittance->save();
    }

    public static function syncForMonth(int $year, int $month): void
    {
        self::healProjectRemittanceReports($year, $month);

        DailyReport::query()
            ->with(['dailySchedule', 'companyRemittance'])
            ->where('paid_to_company', true)
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)->whereMonth('work_date', $month);
            })
            ->get()
            ->each(fn (DailyReport $report) => self::syncForReport($report));
    }

    public static function healProjectRemittanceReports(int $year, int $month): void
    {
        DailyReport::query()
            ->with(['dailySchedule.cleaningProject'])
            ->where('paid_to_company', false)
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)
                    ->whereMonth('work_date', $month)
                    ->whereHas('cleaningProject', fn ($project) => $project->where('expects_company_remittance', true));
            })
            ->get()
            ->each(fn (DailyReport $report) => EmployeeReportSupport::resyncFromSchedule(
                $report,
                ['paid_to_company' => true],
                false,
            ));
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

        $report->loadMissing('companyRemittance');

        return $report->companyRemittance?->status === CompanyRemittance::STATUS_CONFIRMED;
    }

    public static function expectedRemittanceAnchor(CompanyRemittance $remittance): ?Carbon
    {
        if ($remittance->expected_remittance_date !== null) {
            return Carbon::parse($remittance->expected_remittance_date)->startOfDay();
        }

        return $remittance->created_at?->copy()->startOfDay();
    }

    public static function isOverdue(CompanyRemittance $remittance): bool
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            return false;
        }

        $now = now();

        if ($remittance->status === CompanyRemittance::STATUS_REMINDED) {
            $anchor = $remittance->reminded_at ?? self::expectedRemittanceAnchor($remittance);

            return $anchor !== null
                && $anchor->copy()->addDays(self::REMIND_SNOOZE_DAYS)->lte($now);
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
        $now = now();
        $pendingCutoff = $now->copy()->subDays(self::OVERDUE_DAYS)->toDateString();
        $remindedCutoff = $now->copy()->subDays(self::REMIND_SNOOZE_DAYS);

        return CompanyRemittance::query()
            ->with([
                'report.dailySchedule.user:id,name,account',
            ])
            ->where(function (Builder $query) use ($pendingCutoff, $remindedCutoff) {
                $query->where(function (Builder $pending) use ($pendingCutoff) {
                    $pending->where('status', CompanyRemittance::STATUS_PENDING)
                        ->whereRaw('COALESCE(expected_remittance_date, date(created_at)) <= ?', [$pendingCutoff]);
                })->orWhere(function (Builder $reminded) use ($remindedCutoff) {
                    $reminded->where('status', CompanyRemittance::STATUS_REMINDED)
                        ->where('reminded_at', '<=', $remindedCutoff);
                });
            });
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
        $remittance->loadMissing('report.dailySchedule.user:id,name,account');
        $report = $remittance->report;
        $schedule = $report?->dailySchedule;

        return [
            'id' => $remittance->id,
            'report_id' => $remittance->report_id,
            'amount' => (int) $remittance->amount,
            'status' => $remittance->status,
            'status_label' => self::statusLabel($remittance->status),
            'is_overdue' => self::isOverdue($remittance),
            'expected_remittance_date' => $remittance->expected_remittance_date?->format('Y-m-d'),
            'reminded_at' => $remittance->reminded_at?->toDateTimeString(),
            'confirmed_at' => $remittance->confirmed_at?->toDateTimeString(),
            'created_at' => $remittance->created_at?->toDateTimeString(),
            'work_date' => $schedule?->work_date?->format('Y-m-d') ?? (string) $schedule?->work_date,
            'employee_name' => $schedule?->user?->name,
            'customer_name' => $schedule?->customer_name,
            'customer_address' => $schedule?->customer_address,
            'customer_phone' => $schedule?->customer_phone,
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

        $report->loadMissing('companyRemittance');
        $remittance = $report->companyRemittance;

        if (! $remittance) {
            return null;
        }

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
