<?php

namespace App\Support;

use App\Models\AccountingSetting;
use App\Models\DailySchedule;
use App\Models\LegacyMonthlyLedger;
use App\Models\ManualPostageEntry;
use App\Models\MonthlyAdvanceEntry;
use App\Models\MonthlyFixedExpense;
use Illuminate\Support\Carbon;

class MonthlyFixedExpenseSupport
{
    /**
     * @return list<array{key:string, label:string, amount:int}>
     */
    public static function amountsForSettlement(string $yearMonth): array
    {
        $record = self::findForMonth($yearMonth);

        if (! $record) {
            return self::payloadFromAmounts([
                MonthlyFixedExpense::KEY_CONTROL => 0,
                MonthlyFixedExpense::KEY_PHONE => 0,
                MonthlyFixedExpense::KEY_AI => 0,
                MonthlyFixedExpense::KEY_AD => 0,
            ]);
        }

        return self::payloadFromRecord($record);
    }

    /**
     * @return array{items:list<array{key:string, label:string, amount:int}>, source:string}
     */
    public static function draftPayload(string $yearMonth): array
    {
        $record = self::findForMonth($yearMonth);

        if ($record) {
            return [
                'items' => self::payloadFromRecord($record),
                'source' => 'monthly',
            ];
        }

        $previousMonth = self::previousYearMonth($yearMonth);
        $previousRecord = $previousMonth ? self::findForMonth($previousMonth) : null;

        if ($previousRecord) {
            return [
                'items' => self::payloadFromRecord($previousRecord),
                'source' => 'draft_previous_month',
            ];
        }

        return [
            'items' => self::payloadFromAmounts(self::defaultAmountMap()),
            'source' => 'defaults',
        ];
    }

    /**
     * @param  list<array{key:string, amount:int, label?:string}>  $expenses
     */
    public static function saveForMonth(string $yearMonth, array $expenses): MonthlyFixedExpense
    {
        $amounts = self::normalizeExpenseInput($expenses);

        return MonthlyFixedExpense::query()->updateOrCreate(
            ['year_month' => $yearMonth],
            $amounts,
        );
    }

    /**
     * @return array<string, int>
     */
    public static function currentGlobalAmountMap(): array
    {
        MonthlyAccounting::ensureDefaultSettings();

        $defaults = collect(MonthlyAccounting::defaultFixedExpenses())->keyBy('key');
        $stored = AccountingSetting::query()
            ->whereIn('key', MonthlyFixedExpense::AMOUNT_KEYS)
            ->get()
            ->keyBy('key');

        $amounts = [];

        foreach (MonthlyFixedExpense::AMOUNT_KEYS as $key) {
            $amounts[$key] = (int) ($stored->get($key)?->amount ?? $defaults->get($key)['amount'] ?? 0);
        }

        return $amounts;
    }

    public static function earliestAccountingYearMonth(): ?string
    {
        $months = collect();

        $scheduleDate = DailySchedule::query()
            ->whereHas('dailyReport')
            ->min('work_date');

        if ($scheduleDate) {
            $months->push(Carbon::parse($scheduleDate)->format('Y-m'));
        }

        $advanceMonth = MonthlyAdvanceEntry::query()->min('year_month');

        if ($advanceMonth) {
            $months->push((string) $advanceMonth);
        }

        $manualPostageMonth = ManualPostageEntry::query()
            ->whereNotNull('mailed_at')
            ->min('mailed_at');

        if ($manualPostageMonth) {
            $months->push(Carbon::parse($manualPostageMonth)->format('Y-m'));
        }

        $manualPostageYearMonth = ManualPostageEntry::query()->min('year_month');

        if ($manualPostageYearMonth) {
            $months->push((string) $manualPostageYearMonth);
        }

        $legacyMonth = LegacyMonthlyLedger::query()->min('year_month');

        if ($legacyMonth) {
            $months->push((string) $legacyMonth);
        }

        return $months->filter()->sort()->first();
    }

    /**
     * @return list<string>
     */
    public static function monthRange(string $fromYearMonth, string $toYearMonth): array
    {
        $start = Carbon::createFromFormat('Y-m-d', $fromYearMonth.'-01')->startOfMonth();
        $end = Carbon::createFromFormat('Y-m-d', $toYearMonth.'-01')->startOfMonth();

        if ($start->gt($end)) {
            return [];
        }

        $months = [];

        for ($cursor = $start->copy(); $cursor->lte($end); $cursor->addMonth()) {
            $months[] = $cursor->format('Y-m');
        }

        return $months;
    }

    public static function previousYearMonth(string $yearMonth): ?string
    {
        return Carbon::createFromFormat('Y-m-d', $yearMonth.'-01')
            ->subMonth()
            ->format('Y-m');
    }

    public static function findForMonth(string $yearMonth): ?MonthlyFixedExpense
    {
        return MonthlyFixedExpense::query()
            ->where('year_month', $yearMonth)
            ->first();
    }

    /**
     * @param  list<array{key:string, amount:int, label?:string}>  $expenses
     * @return array<string, int>
     */
    public static function normalizeExpenseInput(array $expenses): array
    {
        $mapped = collect($expenses)->keyBy('key');
        $amounts = [];

        foreach (MonthlyFixedExpense::AMOUNT_KEYS as $key) {
            $amounts[$key] = max(0, (int) ($mapped->get($key)['amount'] ?? 0));
        }

        return $amounts;
    }

    /**
     * @return array<string, int>
     */
    private static function defaultAmountMap(): array
    {
        $defaults = collect(MonthlyAccounting::defaultFixedExpenses())->keyBy('key');
        $amounts = [];

        foreach (MonthlyFixedExpense::AMOUNT_KEYS as $key) {
            $amounts[$key] = (int) ($defaults->get($key)['amount'] ?? 0);
        }

        return $amounts;
    }

    /**
     * @param  array<string, int>  $amounts
     * @return list<array{key:string, label:string, amount:int}>
     */
    private static function payloadFromAmounts(array $amounts): array
    {
        return collect(MonthlyFixedExpense::AMOUNT_KEYS)
            ->map(fn (string $key) => [
                'key' => $key,
                'label' => self::labelForKey($key),
                'amount' => (int) ($amounts[$key] ?? 0),
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array{key:string, label:string, amount:int}>
     */
    private static function payloadFromRecord(MonthlyFixedExpense $record): array
    {
        return self::payloadFromAmounts([
            MonthlyFixedExpense::KEY_CONTROL => (int) $record->expense_control,
            MonthlyFixedExpense::KEY_PHONE => (int) $record->expense_phone,
            MonthlyFixedExpense::KEY_AI => (int) $record->expense_ai,
            MonthlyFixedExpense::KEY_AD => (int) $record->expense_ad,
        ]);
    }

    private static function labelForKey(string $key): string
    {
        MonthlyAccounting::ensureDefaultSettings();

        $stored = AccountingSetting::query()->find($key);
        $defaults = collect(MonthlyAccounting::defaultFixedExpenses())->keyBy('key');

        return $stored?->label ?? $defaults->get($key)['label'] ?? $key;
    }
}
