<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use Illuminate\Support\Collection;

class MailTrackingSupport
{
    /**
     * @return array{index:int,total:int,group_units:?int,group_price:?int}|null
     */
    public static function parseMultiAddressPart(DailySchedule $schedule): ?array
    {
        $notes = (string) ($schedule->notes ?? '');

        if (! preg_match('/\[多址\s+(\d+)\/(\d+)(?:·共(\d+)離(\d+))?\]/u', $notes, $matches)) {
            return null;
        }

        return [
            'index' => (int) $matches[1],
            'total' => (int) $matches[2],
            'group_units' => isset($matches[3]) ? (int) $matches[3] : null,
            'group_price' => isset($matches[4]) ? (int) $matches[4] : null,
        ];
    }

    public static function scheduleHasMailableItems(DailySchedule $schedule): bool
    {
        if ((bool) $schedule->needs_receipt) {
            return true;
        }

        if ((bool) $schedule->needs_invoice) {
            return true;
        }

        $lines = SchedulePricing::normalizeLines(
            $schedule->pricing_lines,
            (int) ($schedule->ac_units ?? 0) ?: null,
            isset($schedule->unit_price) ? (int) $schedule->unit_price : null,
        );

        return collect($lines)->contains(
            fn (array $line): bool => SchedulePricing::lineHasInvoice($line)
        );
    }

    public static function scheduleRequiresMailTracking(DailySchedule $schedule): bool
    {
        if (! (bool) $schedule->needs_mail) {
            return false;
        }

        return self::scheduleHasMailableItems($schedule);
    }

    public static function reportRequiresMailTracking(DailyReport $report): bool
    {
        return (bool) $report->needs_invoice_and_mail
            || (bool) $report->needs_receipt_and_mail;
    }

    public static function isPrimaryMailSchedule(DailySchedule $schedule): bool
    {
        $part = self::parseMultiAddressPart($schedule);

        if ($part === null) {
            return true;
        }

        return $part['index'] === 1;
    }

    public static function mailOrderGroupKey(DailySchedule $schedule): string
    {
        if ($schedule->cleaning_project_id) {
            return sprintf(
                'project:%d:%s',
                (int) $schedule->cleaning_project_id,
                $schedule->work_date?->format('Y-m-d') ?? ''
            );
        }

        $part = self::parseMultiAddressPart($schedule);
        $date = $schedule->work_date?->format('Y-m-d') ?? '';
        $phone = preg_replace('/\D+/', '', (string) $schedule->customer_phone) ?? '';
        $name = mb_strtolower(trim((string) $schedule->customer_name));

        if ($part !== null) {
            return sprintf('multi:%s|%s|%s|%d', $date, $phone, $name, $part['total']);
        }

        return 'schedule:'.(int) $schedule->id;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function enforceStorageRules(array $payload): array
    {
        $multiAddressPart = is_array($payload['multi_address_part'] ?? null)
            ? $payload['multi_address_part']
            : null;
        $partIndex = max(1, (int) ($multiAddressPart['index'] ?? 1));

        if ($multiAddressPart && $partIndex > 1) {
            return self::stripMailTrackingFields($payload);
        }

        $lines = SchedulePricing::normalizeLines(
            $payload['pricing_lines'] ?? null,
            isset($payload['ac_units']) ? (int) $payload['ac_units'] : null,
            isset($payload['unit_price']) ? (int) $payload['unit_price'] : null,
        );
        $hasMailableItems = (bool) ($payload['needs_receipt'] ?? false)
            || collect($lines)->contains(fn (array $line): bool => SchedulePricing::lineHasInvoice($line))
            || (bool) ($payload['needs_invoice'] ?? false);
        $needsMail = (bool) ($payload['needs_mail'] ?? false);

        if (! $needsMail || ! $hasMailableItems) {
            $payload = self::stripMailContactFields($payload);

            if (! $needsMail) {
                $payload['needs_mail'] = false;
            }

            return $payload;
        }

        $payload['needs_mail'] = true;
        $payload['mail_recipient'] = self::nullableTrim(
            $payload['mail_recipient'] ?? $payload['customer_name'] ?? null
        );
        $payload['mail_phone'] = self::nullableTrim(
            $payload['mail_phone'] ?? $payload['customer_phone'] ?? null
        );
        $payload['mail_address'] = self::nullableTrim(
            $payload['mail_address'] ?? $payload['customer_address'] ?? null
        );

        return $payload;
    }

    /**
     * @param  Collection<int, DailySchedule>  $schedules
     * @return Collection<int, DailySchedule>
     */
    public static function uniqueMailTrackingSchedules(Collection $schedules): Collection
    {
        $seen = [];

        return $schedules
            ->filter(function (DailySchedule $schedule) use (&$seen) {
                if (! self::scheduleRequiresMailTracking($schedule)) {
                    return false;
                }

                if (! self::isPrimaryMailSchedule($schedule)) {
                    return false;
                }

                $key = self::mailOrderGroupKey($schedule);

                if (isset($seen[$key])) {
                    return false;
                }

                $seen[$key] = true;

                return true;
            })
            ->values();
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     * @return Collection<int, DailyReport>
     */
    public static function uniqueMailTrackingReports(Collection $reports): Collection
    {
        $seen = [];

        return $reports
            ->filter(function (DailyReport $report) use (&$seen) {
                if (! self::reportRequiresMailTracking($report)) {
                    return false;
                }

                $schedule = $report->dailySchedule;

                if (! $schedule) {
                    return true;
                }

                $key = 'report:'.self::mailOrderGroupKey($schedule);

                if (isset($seen[$key])) {
                    return false;
                }

                $seen[$key] = true;

                return true;
            })
            ->values();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private static function stripMailTrackingFields(array $payload): array
    {
        $payload['needs_mail'] = false;
        $payload['needs_invoice'] = false;
        $payload['needs_receipt'] = false;
        $payload['invoice_charge_customer_tax'] = false;
        $payload['invoice_planned_date'] = null;
        $payload['invoice_tax_id'] = null;
        $payload['invoice_title'] = null;
        $payload['hongyi_fee'] = 0;

        return self::stripMailContactFields($payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private static function stripMailContactFields(array $payload): array
    {
        $payload['mail_recipient'] = null;
        $payload['mail_phone'] = null;
        $payload['mail_address'] = null;

        return $payload;
    }

    private static function nullableTrim(mixed $value): ?string
    {
        $text = trim((string) ($value ?? ''));

        return $text !== '' ? $text : null;
    }
}
