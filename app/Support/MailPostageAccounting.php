<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\ManualPostageEntry;
use Illuminate\Database\Eloquent\Builder;

class MailPostageAccounting
{
    /**
     * @return array{0: string, 1: string}
     */
    public static function monthBounds(int $year, int $month): array
    {
        $start = sprintf('%04d-%02d-01', $year, $month);
        $end = date('Y-m-t', strtotime($start));

        return [$start, $end];
    }

    public static function countSentRecipientsForMonth(int $year, int $month): int
    {
        $keys = [];

        self::sentSchedulesForMonthQuery($year, $month)
            ->with('dailyReport')
            ->each(function (DailySchedule $schedule) use (&$keys) {
                $report = $schedule->dailyReport;

                if (
                    $report
                    && $report->invoice_sent
                    && ((bool) $report->needs_invoice_and_mail || (bool) $report->needs_receipt_and_mail)
                ) {
                    return;
                }

                $keys[MailMergeSupport::accountingPostageKey($schedule)] = true;
            });

        self::sentReportsForMonthQuery($year, $month)
            ->with('dailySchedule')
            ->each(function (DailyReport $report) use (&$keys) {
                $schedule = $report->dailySchedule;

                if ($schedule) {
                    $keys[MailMergeSupport::accountingPostageKey($schedule)] = true;
                }
            });

        return count($keys);
    }

    /**
     * @return Builder<DailySchedule>
     */
    public static function sentSchedulesForMonthQuery(int $year, int $month): Builder
    {
        [$start, $end] = self::monthBounds($year, $month);

        return DailySchedule::query()
            ->where('invoice_sent', true)
            ->whereNotNull('mailed_at')
            ->whereBetween('mailed_at', [$start, $end])
            ->where(function ($builder) {
                $builder
                    ->where('needs_mail', true)
                    ->orWhere('needs_invoice', true)
                    ->orWhere('needs_receipt', true);
            });
    }

    /**
     * @return Builder<DailyReport>
     */
    public static function sentReportsForMonthQuery(int $year, int $month): Builder
    {
        [$start, $end] = self::monthBounds($year, $month);

        return DailyReport::query()
            ->where('invoice_sent', true)
            ->whereNotNull('mailed_at')
            ->whereBetween('mailed_at', [$start, $end])
            ->where(function ($builder) {
                $builder
                    ->where('needs_invoice_and_mail', true)
                    ->orWhere('needs_receipt_and_mail', true);
            });
    }

    /**
     * @return Builder<ManualPostageEntry>
     */
    public static function manualPostageForMonthQuery(int $year, int $month): Builder
    {
        [$start, $end] = self::monthBounds($year, $month);

        return ManualPostageEntry::query()
            ->whereNotNull('mailed_at')
            ->whereBetween('mailed_at', [$start, $end]);
    }

    public static function resolveMailedAt(?string $mailedAt, bool $defaultToToday = true): ?string
    {
        $value = trim((string) ($mailedAt ?? ''));

        if ($value !== '') {
            return $value;
        }

        return $defaultToToday ? now()->toDateString() : null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function manualPostageEntriesForMonth(int $year, int $month): array
    {
        return self::manualPostageForMonthQuery($year, $month)
            ->orderByDesc('mailed_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ManualPostageEntry $entry) => [
                'id' => $entry->id,
                'year_month' => $entry->year_month,
                'mailed_at' => $entry->mailed_at?->format('Y-m-d'),
                'amount' => (int) $entry->amount,
                'mail_recipient' => $entry->mail_recipient,
                'mail_phone' => $entry->mail_phone,
                'mail_address' => $entry->mail_address,
                'notes' => $entry->notes,
                'created_at' => $entry->created_at?->toDateTimeString(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{
     *     schedule_postage_count:int,
     *     manual_postage_count:int,
     *     postage_unit:int,
     *     postage_total:int
     * }
     */
    public static function postageTotalsForMonth(int $year, int $month, int $unitAmount = 28): array
    {
        $scheduleCount = self::countSentRecipientsForMonth($year, $month);
        $manualCount = self::manualPostageForMonthQuery($year, $month)->count();

        return [
            'schedule_postage_count' => $scheduleCount,
            'manual_postage_count' => $manualCount,
            'postage_unit' => $unitAmount,
            'postage_total' => ($scheduleCount + $manualCount) * $unitAmount,
        ];
    }
}
