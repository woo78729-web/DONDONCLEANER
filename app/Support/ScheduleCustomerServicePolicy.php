<?php

namespace App\Support;

use App\Models\DailySchedule;
use App\Models\User;

class ScheduleCustomerServicePolicy
{
    public static function applies(User $user): bool
    {
        return $user->role === 'customer_service';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function preparePayload(array $payload, User $user, ?DailySchedule $existing = null): array
    {
        if (! self::applies($user)) {
            return $payload;
        }

        $requestedLines = is_array($payload['pricing_lines'] ?? null) ? $payload['pricing_lines'] : [];
        $totalUnits = max(1, self::sumUnits($requestedLines));

        if ($existing) {
            $payload['pricing_lines'] = self::mergeUnitsIntoExistingLines(
                $existing->pricing_lines,
                $totalUnits,
                (int) ($existing->unit_price ?? 1500),
            );
            $payload['ac_units'] = $totalUnits;
            $payload['unit_price'] = $existing->unit_price;
            $payload['cleaning_price'] = $existing->cleaning_price;
            $needsInvoice = array_key_exists('needs_invoice', $payload)
                ? (bool) $payload['needs_invoice']
                : (bool) $existing->needs_invoice;
            $payload['needs_invoice'] = $needsInvoice;
            if ($needsInvoice) {
                $payload['invoice_tax_id'] = isset($payload['invoice_tax_id']) && $payload['invoice_tax_id'] !== ''
                    ? trim((string) $payload['invoice_tax_id'])
                    : $existing->invoice_tax_id;
                $payload['invoice_title'] = isset($payload['invoice_title']) && $payload['invoice_title'] !== ''
                    ? trim((string) $payload['invoice_title'])
                    : $existing->invoice_title;
            } else {
                $payload['invoice_tax_id'] = null;
                $payload['invoice_title'] = null;
            }
            $payload['needs_mail'] = $payload['needs_mail'] ?? $existing->needs_mail;

            if ((int) $existing->cleaning_price === 0) {
                $payload['task_details'] = $totalUnits.'台';
            }

            return $payload;
        }

        $payload['pricing_lines'] = [
            ['ac_units' => $totalUnits, 'unit_price' => 1500, 'is_taxable' => false],
        ];
        $needsInvoice = (bool) ($payload['needs_invoice'] ?? false);
        $payload['needs_invoice'] = $needsInvoice;
        $payload['invoice_tax_id'] = $needsInvoice && ! empty($payload['invoice_tax_id'])
            ? trim((string) $payload['invoice_tax_id'])
            : null;
        $payload['invoice_title'] = $needsInvoice && ! empty($payload['invoice_title'])
            ? trim((string) $payload['invoice_title'])
            : null;

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function finalizePayload(array $payload, User $user, ?DailySchedule $existing = null): array
    {
        if (! self::applies($user)) {
            return $payload;
        }

        if ($existing && (int) $existing->cleaning_price > 0) {
            $payload['cleaning_price'] = $existing->cleaning_price;
            $payload['unit_price'] = $existing->unit_price;
            $payload['needs_invoice'] = $existing->needs_invoice;
            $payload['invoice_tax_id'] = $existing->invoice_tax_id;
            $payload['invoice_title'] = $existing->invoice_title;
            $payload['task_details'] = $existing->task_details;

            return $payload;
        }

        $payload['cleaning_price'] = 0;
        $payload['task_details'] = ((int) ($payload['ac_units'] ?? 1)).'台';

        return $payload;
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     */
    private static function sumUnits(array $lines): int
    {
        $total = 0;

        foreach ($lines as $line) {
            $total += (int) ($line['ac_units'] ?? 0);
        }

        return $total;
    }

    /**
     * @param  mixed  $existingLines
     * @return list<array{ac_units:int, unit_price:int}>
     */
    private static function mergeUnitsIntoExistingLines(mixed $existingLines, int $totalUnits, int $unitPrice): array
    {
        if (is_array($existingLines) && $existingLines !== []) {
            $first = $existingLines[0];
            $merged = [
                [
                    'ac_units' => $totalUnits,
                    'unit_price' => (int) ($first['unit_price'] ?? $unitPrice),
                    'is_taxable' => (bool) ($first['is_taxable'] ?? false),
                ],
            ];

            for ($index = 1; $index < count($existingLines); $index++) {
                $merged[] = [
                    'ac_units' => (int) ($existingLines[$index]['ac_units'] ?? 0),
                    'unit_price' => (int) ($existingLines[$index]['unit_price'] ?? $unitPrice),
                    'is_taxable' => (bool) ($existingLines[$index]['is_taxable'] ?? false),
                ];
            }

            return $merged;
        }

        return [
            ['ac_units' => $totalUnits, 'unit_price' => $unitPrice, 'is_taxable' => false],
        ];
    }
}
