<?php

namespace App\Support;

use App\Models\LegacyMonthlyAdvance;
use App\Models\LegacyMonthlyLedger;
use App\Models\PerformanceGroup;
use Illuminate\Support\Facades\DB;

class LegacyLedgerSupport
{
    public const GROUP_DEFINITIONS = [
        ['key' => 'jun', 'label' => '鈞', 'sort_order' => 1],
        ['key' => 'qian', 'label' => '阡', 'sort_order' => 2],
    ];

    public static function ensureGroups(): void
    {
        foreach (self::GROUP_DEFINITIONS as $group) {
            PerformanceGroup::query()->firstOrCreate(
                ['key' => $group['key']],
                [
                    'label' => $group['label'],
                    'sort_order' => $group['sort_order'],
                ],
            );
        }
    }

    /**
     * @param  array<string, array{1500?:int,1300?:int,1000?:int}>|null  $dailyUnits
     * @return array{
     *     units_1500:int,
     *     units_1300:int,
     *     units_1000:int,
     *     total_units:int,
     *     total_revenue:int,
     *     gross_profit:int,
     *     net_profit:int|null,
     *     hongyi_share:int|null
     * }
     */
    public static function computeTotals(?array $dailyUnits, ?int $totalRevenue = null, ?int $grossProfit = null, ?int $netProfit = null, ?int $hongyiShare = null): array
    {
        $units1500 = 0;
        $units1300 = 0;
        $units1000 = 0;

        foreach ($dailyUnits ?? [] as $dayUnits) {
            if (! is_array($dayUnits)) {
                continue;
            }

            $units1500 += (int) ($dayUnits['1500'] ?? $dayUnits['u1500'] ?? 0);
            $units1300 += (int) ($dayUnits['1300'] ?? $dayUnits['u1300'] ?? 0);
            $units1000 += (int) ($dayUnits['1000'] ?? $dayUnits['u1000'] ?? 0);
        }

        $computedRevenue = ($units1500 * 1500) + ($units1300 * 1300) + ($units1000 * 1000);
        $computedGross = ($units1500 * 600) + ($units1300 * 500) + ($units1000 * 400);

        return [
            'units_1500' => $units1500,
            'units_1300' => $units1300,
            'units_1000' => $units1000,
            'total_units' => $units1500 + $units1300 + $units1000,
            'total_revenue' => $totalRevenue ?? $computedRevenue,
            'gross_profit' => $grossProfit ?? $computedGross,
            'net_profit' => $netProfit,
            'hongyi_share' => $hongyiShare ?? ($netProfit !== null ? (int) round($netProfit / 2) : null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildYearlyTrends(?int $fromYear = null, ?int $toYear = null): array
    {
        self::ensureGroups();

        $fromYear ??= now()->year - 5;
        $toYear ??= now()->year;

        if ($fromYear > $toYear) {
            [$fromYear, $toYear] = [$toYear, $fromYear];
        }

        $years = range($fromYear, $toYear);
        $monthKeys = collect(range(1, 12))
            ->map(fn (int $month) => str_pad((string) $month, 2, '0', STR_PAD_LEFT))
            ->all();

        $groups = PerformanceGroup::query()->orderBy('sort_order')->get();
        $ledgers = LegacyMonthlyLedger::query()
            ->with('performanceGroup:id,key,label,sort_order')
            ->where('year_month', '>=', sprintf('%04d-01', $fromYear))
            ->where('year_month', '<=', sprintf('%04d-12', $toYear))
            ->get();

        $groupSeries = [];
        $companyMatrix = self::blankYearMonthMatrix($years, $monthKeys);

        foreach ($groups as $group) {
            $groupMatrix = self::blankYearMonthMatrix($years, $monthKeys);
            $yearTotals = [];

            foreach ($years as $year) {
                $yearTotals[$year] = [
                    'year' => $year,
                    'total_units' => 0,
                    'total_revenue' => 0,
                    'gross_profit' => 0,
                    'net_profit' => 0,
                ];
            }

            foreach ($ledgers as $ledger) {
                if ((int) $ledger->performance_group_id !== (int) $group->id) {
                    continue;
                }

                [$year, $month] = explode('-', $ledger->year_month);
                $year = (int) $year;

                if (! isset($groupMatrix[$year])) {
                    continue;
                }

                $units = $ledger->units_1500 + $ledger->units_1300 + $ledger->units_1000;

                $groupMatrix[$year]['monthly'][$month] += $units;
                $groupMatrix[$year]['year_total'] += $units;
                $groupMatrix[$year]['monthly_revenue'][$month] += $ledger->total_revenue;
                $groupMatrix[$year]['year_revenue'] += $ledger->total_revenue;
                $groupMatrix[$year]['monthly_profit'][$month] += $ledger->net_profit;
                $groupMatrix[$year]['year_profit'] += $ledger->net_profit;

                $yearTotals[$year]['total_units'] += $units;
                $yearTotals[$year]['total_revenue'] += $ledger->total_revenue;
                $yearTotals[$year]['gross_profit'] += $ledger->gross_profit;
                $yearTotals[$year]['net_profit'] += $ledger->net_profit;

                $companyMatrix[$year]['monthly'][$month] += $units;
                $companyMatrix[$year]['year_total'] += $units;
                $companyMatrix[$year]['monthly_revenue'][$month] += $ledger->total_revenue;
                $companyMatrix[$year]['year_revenue'] += $ledger->total_revenue;
                $companyMatrix[$year]['monthly_profit'][$month] += $ledger->net_profit;
                $companyMatrix[$year]['year_profit'] += $ledger->net_profit;
            }

            $groupSeries[] = [
                'group_key' => $group->key,
                'group_label' => $group->label,
                'years' => array_values(array_map(
                    fn (int $year) => [
                        'year' => $year,
                        'total_units' => $yearTotals[$year]['total_units'],
                        'total_revenue' => $yearTotals[$year]['total_revenue'],
                        'gross_profit' => $yearTotals[$year]['gross_profit'],
                        'net_profit' => $yearTotals[$year]['net_profit'],
                        'monthly_units' => $groupMatrix[$year]['monthly'],
                        'monthly_revenue' => $groupMatrix[$year]['monthly_revenue'],
                        'monthly_profit' => $groupMatrix[$year]['monthly_profit'],
                    ],
                    $years,
                )),
            ];
        }

        $livePerformance = UnitPerformanceReport::build($fromYear, $toYear);
        $companyTotals = array_values(array_map(
            fn (int $year) => [
                'year' => $year,
                'total_units' => $companyMatrix[$year]['year_total'],
                'total_revenue' => $companyMatrix[$year]['year_revenue'],
                'net_profit' => $companyMatrix[$year]['year_profit'],
                'monthly_units' => $companyMatrix[$year]['monthly'],
                'monthly_revenue' => $companyMatrix[$year]['monthly_revenue'],
                'monthly_profit' => $companyMatrix[$year]['monthly_profit'],
            ],
            $years,
        ));

        return [
            'from_year' => $fromYear,
            'to_year' => $toYear,
            'years' => $years,
            'months' => $monthKeys,
            'month_labels' => array_map(fn (string $month) => (int) $month.'月', $monthKeys),
            'groups' => $groupSeries,
            'company_totals' => $companyTotals,
            'year_over_year' => self::buildYearOverYearMonthly(
                $companyTotals,
                $livePerformance['company_totals'] ?? [],
            ),
            'live_unit_performance' => $livePerformance,
            'remittance_rates' => EmployeeRemittance::remittanceMap(),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $legacyCompanyTotals
     * @param  list<array<string, mixed>>  $liveCompanyTotals
     * @return array<string, mixed>
     */
    public static function buildYearOverYearMonthly(array $legacyCompanyTotals, array $liveCompanyTotals): array
    {
        $thisYear = now()->year;
        $lastYear = $thisYear - 1;
        $monthKeys = collect(range(1, 12))
            ->map(fn (int $month) => str_pad((string) $month, 2, '0', STR_PAD_LEFT))
            ->all();

        $legacyThis = collect($legacyCompanyTotals)->firstWhere('year', $thisYear) ?? [];
        $legacyLast = collect($legacyCompanyTotals)->firstWhere('year', $lastYear) ?? [];
        $liveThis = collect($liveCompanyTotals)->firstWhere('year', $thisYear) ?? [];

        $buildSeries = function (string $legacyKey, ?string $liveKey = null) use ($monthKeys, $legacyThis, $legacyLast, $liveThis): array {
            $lastYearSeries = [];
            $thisYearSeries = [];

            foreach ($monthKeys as $month) {
                $lastYearSeries[] = (int) ($legacyLast[$legacyKey][$month] ?? 0);
                $legacyValue = (int) ($legacyThis[$legacyKey][$month] ?? 0);
                $liveValue = $liveKey ? (int) ($liveThis[$liveKey][$month] ?? 0) : 0;
                $thisYearSeries[] = $legacyValue + $liveValue;
            }

            return [
                'last_year' => $lastYearSeries,
                'this_year' => $thisYearSeries,
            ];
        };

        return [
            'this_year' => $thisYear,
            'last_year' => $lastYear,
            'month_labels' => array_map(fn (string $month) => (int) $month.'月', $monthKeys),
            'units' => $buildSeries('monthly_units', 'monthly'),
            'revenue' => $buildSeries('monthly_revenue'),
            'profit' => $buildSeries('monthly_profit'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildMonthDetail(string $yearMonth): array
    {
        self::ensureGroups();

        $groups = PerformanceGroup::query()->orderBy('sort_order')->get();
        $ledgers = LegacyMonthlyLedger::query()
            ->with('performanceGroup:id,key,label,sort_order')
            ->where('year_month', $yearMonth)
            ->get()
            ->keyBy('performance_group_id');

        $advances = LegacyMonthlyAdvance::query()
            ->where('year_month', $yearMonth)
            ->orderBy('partner')
            ->orderBy('id')
            ->get()
            ->map(fn (LegacyMonthlyAdvance $entry) => [
                'id' => $entry->id,
                'partner' => $entry->partner,
                'partner_label' => MonthlyAccounting::partnerLabel($entry->partner),
                'label' => $entry->label,
                'amount' => $entry->amount,
            ])
            ->values()
            ->all();

        $groupPayloads = $groups->map(function (PerformanceGroup $group) use ($ledgers) {
            $ledger = $ledgers->get($group->id);

            if (! $ledger) {
                return [
                    'group_key' => $group->key,
                    'group_label' => $group->label,
                    'has_data' => false,
                    'ledger' => null,
                ];
            }

            return [
                'group_key' => $group->key,
                'group_label' => $group->label,
                'has_data' => true,
                'ledger' => self::ledgerPayload($ledger),
            ];
        })->values()->all();

        return [
            'year_month' => $yearMonth,
            'groups' => $groupPayloads,
            'advances' => $advances,
            'remittance_rates' => EmployeeRemittance::remittanceMap(),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function importMonth(array $payload): array
    {
        self::ensureGroups();

        $yearMonth = $payload['year_month'];
        $groupsByKey = PerformanceGroup::query()->pluck('id', 'key');

        return DB::transaction(function () use ($payload, $yearMonth, $groupsByKey) {
            LegacyMonthlyAdvance::query()->where('year_month', $yearMonth)->delete();

            $savedGroups = [];

            foreach ($payload['groups'] as $groupPayload) {
                $groupKey = $groupPayload['group_key'] ?? null;
                $groupId = $groupsByKey[$groupKey] ?? null;

                if (! $groupId) {
                    continue;
                }

                $computed = self::computeTotals(
                    $groupPayload['daily_units'] ?? null,
                    isset($groupPayload['total_revenue']) ? (int) $groupPayload['total_revenue'] : null,
                    isset($groupPayload['gross_profit']) ? (int) $groupPayload['gross_profit'] : null,
                    isset($groupPayload['net_profit']) ? (int) $groupPayload['net_profit'] : null,
                    isset($groupPayload['hongyi_share']) ? (int) $groupPayload['hongyi_share'] : null,
                );

                $ledger = LegacyMonthlyLedger::query()->updateOrCreate(
                    [
                        'year_month' => $yearMonth,
                        'performance_group_id' => $groupId,
                    ],
                    [
                        'daily_units' => $groupPayload['daily_units'] ?? null,
                        'units_1500' => $computed['units_1500'],
                        'units_1300' => $computed['units_1300'],
                        'units_1000' => $computed['units_1000'],
                        'total_revenue' => $computed['total_revenue'],
                        'gross_profit' => $computed['gross_profit'],
                        'net_profit' => $computed['net_profit'] ?? 0,
                        'hongyi_share' => $computed['hongyi_share'] ?? 0,
                        'source' => $payload['source'] ?? 'import',
                        'notes' => $payload['notes'] ?? null,
                    ],
                );

                $savedGroups[] = self::ledgerPayload($ledger->load('performanceGroup:id,key,label,sort_order'));
            }

            foreach ($payload['advances'] ?? [] as $advancePayload) {
                LegacyMonthlyAdvance::query()->create([
                    'year_month' => $yearMonth,
                    'partner' => $advancePayload['partner'],
                    'label' => $advancePayload['label'],
                    'amount' => (int) $advancePayload['amount'],
                ]);
            }

            return [
                'year_month' => $yearMonth,
                'groups' => $savedGroups,
                'detail' => self::buildMonthDetail($yearMonth),
            ];
        });
    }

    /**
     * @param  list<array<string, mixed>>  $months
     * @return array<string, mixed>
     */
    public static function importBulk(array $months): array
    {
        return DB::transaction(function () use ($months) {
            $imported = [];

            foreach ($months as $payload) {
                $imported[] = self::importMonth($payload);
            }

            return [
                'imported_count' => count($imported),
                'months' => array_map(fn (array $result) => $result['year_month'], $imported),
                'details' => $imported,
            ];
        });
    }

    public static function deleteMonth(string $yearMonth): void
    {
        LegacyMonthlyLedger::query()->where('year_month', $yearMonth)->delete();
        LegacyMonthlyAdvance::query()->where('year_month', $yearMonth)->delete();
    }

    /**
     * @return list<string>
     */
    public static function listMonths(): array
    {
        $ledgerMonths = LegacyMonthlyLedger::query()->distinct()->pluck('year_month');
        $advanceMonths = LegacyMonthlyAdvance::query()->distinct()->pluck('year_month');

        return $ledgerMonths
            ->merge($advanceMonths)
            ->unique()
            ->sort()
            ->reverse()
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public static function ledgerPayload(LegacyMonthlyLedger $ledger): array
    {
        $group = $ledger->performanceGroup;

        return [
            'id' => $ledger->id,
            'year_month' => $ledger->year_month,
            'group_key' => $group?->key,
            'group_label' => $group?->label,
            'daily_units' => $ledger->daily_units ?? [],
            'units_1500' => $ledger->units_1500,
            'units_1300' => $ledger->units_1300,
            'units_1000' => $ledger->units_1000,
            'total_units' => $ledger->units_1500 + $ledger->units_1300 + $ledger->units_1000,
            'total_revenue' => $ledger->total_revenue,
            'gross_profit' => $ledger->gross_profit,
            'net_profit' => $ledger->net_profit,
            'hongyi_share' => $ledger->hongyi_share,
            'source' => $ledger->source,
            'notes' => $ledger->notes,
            'weekly_totals' => self::weeklyTotals($ledger->daily_units ?? []),
        ];
    }

    /**
     * @param  array<string, array<string, int>>  $dailyUnits
     * @return list<array{week:int, units:int, revenue:int}>
     */
    public static function weeklyTotals(array $dailyUnits): array
    {
        $weeks = [];

        for ($week = 1; $week <= 5; $week++) {
            $weeks[$week] = ['week' => $week, 'units' => 0, 'revenue' => 0];
        }

        foreach ($dailyUnits as $day => $units) {
            $dayNumber = (int) $day;

            if ($dayNumber < 1 || $dayNumber > 31 || ! is_array($units)) {
                continue;
            }

            $week = (int) ceil($dayNumber / 7);
            $u1500 = (int) ($units['1500'] ?? $units['u1500'] ?? 0);
            $u1300 = (int) ($units['1300'] ?? $units['u1300'] ?? 0);
            $u1000 = (int) ($units['1000'] ?? $units['u1000'] ?? 0);
            $dayUnits = $u1500 + $u1300 + $u1000;
            $dayRevenue = ($u1500 * 1500) + ($u1300 * 1300) + ($u1000 * 1000);

            $weeks[$week]['units'] += $dayUnits;
            $weeks[$week]['revenue'] += $dayRevenue;
        }

        return array_values($weeks);
    }

    /**
     * @param  list<int>  $years
     * @param  list<string>  $monthKeys
     * @return array<int, array<string, mixed>>
     */
    private static function blankYearMonthMatrix(array $years, array $monthKeys): array
    {
        $matrix = [];

        foreach ($years as $year) {
            $matrix[$year] = [
                'monthly' => array_fill_keys($monthKeys, 0),
                'monthly_revenue' => array_fill_keys($monthKeys, 0),
                'monthly_profit' => array_fill_keys($monthKeys, 0),
                'year_total' => 0,
                'year_revenue' => 0,
                'year_profit' => 0,
            ];
        }

        return $matrix;
    }
}
