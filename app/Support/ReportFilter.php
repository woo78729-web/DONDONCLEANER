<?php

namespace App\Support;

use App\Models\DailyReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class ReportFilter
{
    /**
     * @return array<string, mixed>
     */
    public static function validate(Request $request, bool $includePagination = true): array
    {
        $rules = [
            'date_from' => ['nullable', 'date'],
            'date_to' => [
                'nullable',
                'date',
                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),
            ],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];

        if ($includePagination) {
            $rules['page'] = ['nullable', 'integer', 'min:1'];
            $rules['per_page'] = ['nullable', 'integer', 'min:1', 'max:100'];
        }

        return $request->validate($rules);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<DailyReport>
     */
    public static function apply(array $filters): Builder
    {
        return DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->with([
                    'user:id,name,account',
                    'cleaningProject',
                ]),
                'companyRemittance',
            ])
            ->whereHas('dailySchedule', function ($scheduleQuery) use ($filters) {
                if (! empty($filters['date_from'])) {
                    $scheduleQuery->whereDate('work_date', '>=', $filters['date_from']);
                }

                if (! empty($filters['date_to'])) {
                    $scheduleQuery->whereDate('work_date', '<=', $filters['date_to']);
                }

                if (! empty($filters['user_id'])) {
                    $scheduleQuery->where('user_id', $filters['user_id']);
                }
            })
            ->orderByDesc('created_at');
    }

    /**
     * 專案回報合併為一列：日期取最後回報日，台數／金額加總。
     *
     * @param  Collection<int, DailyReport>  $reports
     * @return Collection<int, array<string, mixed>>
     */
    public static function collapseForAdminList(Collection $reports): Collection
    {
        $standalone = collect();
        /** @var array<int, list<DailyReport>> $projectGroups */
        $projectGroups = [];

        foreach ($reports as $report) {
            $projectId = $report->dailySchedule?->cleaning_project_id;

            if (! $projectId) {
                $standalone->push(EmployeeReportSupport::reportPayload($report));
                continue;
            }

            $projectGroups[(int) $projectId][] = $report;
        }

        $merged = $standalone;

        foreach ($projectGroups as $group) {
            $merged->push(self::mergeProjectReportGroup(collect($group)));
        }

        return $merged
            ->sortByDesc(function (array $payload) {
                $workDate = $payload['daily_schedule']['work_date'] ?? '';
                if (is_string($workDate) && strlen($workDate) >= 10) {
                    $workDate = substr($workDate, 0, 10);
                }

                $createdAt = $payload['created_at'] ?? '';

                return $workDate.'|'.$createdAt;
            })
            ->values();
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     * @return array<string, mixed>
     */
    private static function mergeProjectReportGroup(Collection $reports): array
    {
        $sorted = $reports
            ->sortBy(function (DailyReport $report) {
                $workDate = $report->dailySchedule?->work_date?->format('Y-m-d') ?? '0000-00-00';

                return $workDate.'-'.str_pad((string) $report->id, 10, '0', STR_PAD_LEFT);
            })
            ->values();

        $latest = $sorted->last();
        $base = EmployeeReportSupport::reportPayload($latest);
        $payloads = $sorted->map(fn (DailyReport $report) => EmployeeReportSupport::reportPayload($report));
        $project = $latest->dailySchedule?->cleaningProject;

        $employeeNames = $sorted
            ->map(fn (DailyReport $report) => $report->dailySchedule?->user?->name)
            ->filter()
            ->unique()
            ->values();

        $completedUnits = (int) $sorted->sum('completed_units');
        $plannedUnits = (int) $sorted->sum(function (DailyReport $report) {
            return (int) ($report->planned_units ?? $report->dailySchedule?->ac_units ?? 0);
        });
        $collectedAmount = (int) $sorted->sum('collected_amount');
        $employeeReceived = (int) $payloads->sum(fn (array $payload) => (int) ($payload['employee_received'] ?? 0));
        $companyInbound = (int) $payloads->sum(fn (array $payload) => (int) ($payload['company_inbound_amount'] ?? 0));
        $paidToCompany = $sorted->contains(fn (DailyReport $report) => (bool) $report->paid_to_company);
        $remittance = $payloads
            ->first(fn (array $payload) => ! empty($payload['company_remittance']))['company_remittance'] ?? null;

        $lastDate = $latest->dailySchedule?->work_date?->format('Y-m-d')
            ?? (string) $latest->dailySchedule?->work_date;

        $schedule = $base['daily_schedule'];
        if (is_object($schedule) && method_exists($schedule, 'toArray')) {
            $schedule = $schedule->toArray();
        } elseif (! is_array($schedule)) {
            $schedule = [];
        }

        $schedule['work_date'] = $lastDate;

        if ($employeeNames->isNotEmpty()) {
            $schedule['user'] = array_merge(
                is_array($schedule['user'] ?? null) ? $schedule['user'] : [],
                ['name' => $employeeNames->join('、')],
            );
        }

        if ($project) {
            $schedule['customer_name'] = $project->customer_name ?? ($schedule['customer_name'] ?? null);
            $schedule['customer_address'] = $project->customer_address ?? ($schedule['customer_address'] ?? null);
            $schedule['customer_phone'] = $project->customer_phone ?? ($schedule['customer_phone'] ?? null);
            $schedule['cleaning_project_id'] = $project->id;
            $schedule['cleaning_project'] = [
                'id' => $project->id,
                'project_code' => $project->project_code,
                'title' => $project->title,
            ];
        }

        $skipReasons = $sorted->pluck('skip_reason')->filter()->unique()->values();

        return [
            ...$base,
            'is_project_total' => true,
            'project_code' => $project?->project_code,
            'member_report_count' => $sorted->count(),
            'member_report_ids' => $sorted->pluck('id')->values()->all(),
            'planned_units' => $plannedUnits,
            'completed_units' => $completedUnits,
            'skipped_units' => max(0, $plannedUnits - $completedUnits),
            'unit_mismatch' => $sorted->contains(fn (DailyReport $report) => (bool) $report->unit_mismatch),
            'skip_reason' => $skipReasons->isNotEmpty() ? $skipReasons->join('；') : null,
            'collected_amount' => $collectedAmount,
            'paid_to_company' => $paidToCompany,
            'total_amount' => $paidToCompany
                ? $companyInbound
                : (int) $payloads->sum(fn (array $payload) => (int) ($payload['total_amount'] ?? 0)),
            'employee_received' => $employeeReceived,
            'company_inbound_amount' => $companyInbound,
            'company_remittance' => $remittance,
            'daily_schedule' => $schedule,
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $collapsed
     * @return array{total_reports: int, total_completed_units: int, total_collected_amount: int}
     */
    public static function summarizeCollapsed(Collection $collapsed): array
    {
        return [
            'total_reports' => $collapsed->count(),
            'total_completed_units' => (int) $collapsed->sum(fn (array $row) => (int) ($row['completed_units'] ?? 0)),
            'total_collected_amount' => (int) $collapsed->sum(function (array $row) {
                if (! empty($row['paid_to_company'])) {
                    return (int) ($row['company_inbound_amount'] ?? $row['total_amount'] ?? 0);
                }

                return (int) ($row['collected_amount'] ?? 0);
            }),
        ];
    }

    /**
     * @return array{total_reports: int, total_completed_units: int, total_collected_amount: int}
     */
    public static function summarize(Builder $query): array
    {
        return [
            'total_reports' => (clone $query)->count(),
            'total_completed_units' => (int) (clone $query)->sum('completed_units'),
            'total_collected_amount' => (int) (clone $query)->sum('collected_amount'),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public static function activeFilters(array $filters): array
    {
        return array_filter([
            'date_from' => $filters['date_from'] ?? null,
            'date_to' => $filters['date_to'] ?? null,
            'user_id' => $filters['user_id'] ?? null,
        ], fn ($value) => $value !== null);
    }
}
