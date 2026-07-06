<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;

class MailRecipientSupport
{
    public static function customerPostageKey(DailySchedule $schedule): string
    {
        $date = $schedule->work_date?->format('Y-m-d') ?? '';
        $phone = self::normalizedCustomerPhone($schedule);

        return implode('|', [$date, $phone]);
    }

    public static function normalizedCustomerPhone(DailySchedule $schedule): string
    {
        return self::normalizePhone($schedule->mail_phone ?: $schedule->customer_phone);
    }

    public static function recipientKey(DailySchedule $schedule): string
    {
        $date = $schedule->work_date?->format('Y-m-d') ?? '';
        $phone = self::normalizePhone($schedule->mail_phone ?: $schedule->customer_phone);
        $address = self::normalizeText($schedule->mail_address ?: $schedule->customer_address);

        return implode('|', [$date, $phone, $address]);
    }

    public static function postageAmountFor(DailySchedule $schedule, bool $needsMail, ?int $excludeReportId = null): int
    {
        if (! $needsMail) {
            return 0;
        }

        if (self::hasPostageChargedForRecipient($schedule, $excludeReportId)) {
            return 0;
        }

        return EmployeeReportSupport::POSTAGE_AMOUNT;
    }

    public static function hasPostageChargedForRecipient(DailySchedule $schedule, ?int $excludeReportId = null): bool
    {
        if ($schedule->mail_merge_group_id) {
            $chargedInGroup = DailyReport::query()
                ->where('temporary_postage', '>', 0)
                ->when($excludeReportId, fn ($query) => $query->where('id', '!=', $excludeReportId))
                ->whereHas('dailySchedule', fn ($query) => $query->where('mail_merge_group_id', $schedule->mail_merge_group_id))
                ->exists();

            if ($chargedInGroup) {
                return true;
            }
        }

        $targetKey = self::customerPostageKey($schedule);
        $workDate = $schedule->work_date?->format('Y-m-d');

        if (! $workDate) {
            return false;
        }

        $reports = DailyReport::query()
            ->where('temporary_postage', '>', 0)
            ->when($excludeReportId, fn ($query) => $query->where('id', '!=', $excludeReportId))
            ->whereHas('dailySchedule', fn ($query) => $query->whereDate('work_date', $workDate))
            ->with('dailySchedule')
            ->get();

        foreach ($reports as $report) {
            $relatedSchedule = $report->dailySchedule;

            if ($relatedSchedule && self::customerPostageKey($relatedSchedule) === $targetKey) {
                return true;
            }
        }

        return false;
    }

    private static function normalizePhone(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value) ?? '';
    }

    private static function normalizeText(?string $value): string
    {
        $text = trim((string) $value);

        return function_exists('mb_strtolower') ? mb_strtolower($text) : strtolower($text);
    }
}
