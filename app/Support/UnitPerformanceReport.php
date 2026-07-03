<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\User;
use Illuminate\Support\Collection;

class UnitPerformanceReport
{
    /**
     * @return array<string, mixed>
     */
    public static function build(?int $fromYear = null, ?int $toYear = null): array
    {
        $fromYear ??= now()->year - 4;
        $toYear ??= now()->year;

        if ($fromYear > $toYear) {
            [$fromYear, $toYear] = [$toYear, $fromYear];
        }

        $reports = DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query
                    ->select('id', 'user_id', 'work_date')
                    ->with('user:id,name,account,role,is_active'),
            ])
            ->whereHas('dailySchedule', function ($query) use ($fromYear, $toYear) {
                $query
                    ->whereDate('work_date', '>=', sprintf('%04d-01-01', $fromYear))
                    ->whereDate('work_date', '<=', sprintf('%04d-12-31', $toYear));
            })
            ->get(['id', 'schedule_id', 'completed_units']);

        $years = range($fromYear, $toYear);
        $monthKeys = collect(range(1, 12))
            ->map(fn (int $month) => str_pad((string) $month, 2, '0', STR_PAD_LEFT))
            ->all();

        $companyTotals = self::blankYearMonthMatrix($years, $monthKeys);
        $employeeTotals = [];

        foreach ($reports as $report) {
            $schedule = $report->dailySchedule;

            if (! $schedule?->work_date || ! $schedule->user) {
                continue;
            }

            $year = (int) $schedule->work_date->format('Y');
            $month = $schedule->work_date->format('m');
            $units = (int) $report->completed_units;
            $employeeId = (int) $schedule->user_id;

            if (! isset($companyTotals[$year])) {
                continue;
            }

            $companyTotals[$year]['monthly'][$month] += $units;
            $companyTotals[$year]['year_total'] += $units;

            if (! isset($employeeTotals[$employeeId])) {
                $employeeTotals[$employeeId] = [
                    'user_id' => $employeeId,
                    'name' => $schedule->user->name,
                    'account' => $schedule->user->account,
                    'is_active' => (bool) $schedule->user->is_active,
                    'years' => self::blankYearMonthMatrix($years, $monthKeys),
                ];
            }

            $employeeTotals[$employeeId]['years'][$year]['monthly'][$month] += $units;
            $employeeTotals[$employeeId]['years'][$year]['year_total'] += $units;
        }

        uasort($employeeTotals, fn ($a, $b) => strcmp($a['name'], $b['name']));

        $yearComparison = self::buildYearComparison($companyTotals);

        return [
            'from_year' => $fromYear,
            'to_year' => $toYear,
            'years' => $years,
            'months' => $monthKeys,
            'month_labels' => array_map(fn (string $month) => (int) $month.'月', $monthKeys),
            'company_totals' => array_values(array_map(
                fn (int $year, array $payload) => ['year' => $year, ...$payload],
                array_keys($companyTotals),
                array_values($companyTotals),
            )),
            'employees' => array_values($employeeTotals),
            'year_comparison' => $yearComparison,
        ];
    }

    /**
     * @param  list<int>  $years
     * @param  list<string>  $monthKeys
     * @return array<int, array{monthly: array<string, int>, year_total: int}>
     */
    private static function blankYearMonthMatrix(array $years, array $monthKeys): array
    {
        $matrix = [];

        foreach ($years as $year) {
            $matrix[$year] = [
                'monthly' => array_fill_keys($monthKeys, 0),
                'year_total' => 0,
            ];
        }

        return $matrix;
    }

    /**
     * @param  array<int, array{monthly: array<string, int>, year_total: int}>  $companyTotals
     * @return list<array<string, int|float|null>>
     */
    private static function buildYearComparison(array $companyTotals): array
    {
        $comparison = [];
        $previousTotal = null;

        foreach ($companyTotals as $year => $payload) {
            $total = $payload['year_total'];
            $change = $previousTotal === null ? null : $total - $previousTotal;
            $changePercent = ($previousTotal === null || $previousTotal === 0)
                ? null
                : round(($change / $previousTotal) * 100, 1);

            $comparison[] = [
                'year' => $year,
                'total_units' => $total,
                'change_from_previous' => $change,
                'change_percent' => $changePercent,
            ];

            $previousTotal = $total;
        }

        return $comparison;
    }
}
