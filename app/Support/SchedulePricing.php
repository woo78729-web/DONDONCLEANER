<?php

namespace App\Support;

class SchedulePricing
{
    /**
     * @return list<int>
     */
    public static function unitPrices(): array
    {
        return [1500, 1300, 1000];
    }

    public static function calculateTotal(int $acUnits, int $unitPrice, bool $needsInvoice): int
    {
        return self::summarizeLines([
            ['ac_units' => $acUnits, 'unit_price' => $unitPrice],
        ], $needsInvoice)['cleaning_price'];
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @return array{ac_units:int, cleaning_price:int, unit_price:int, task_details:string}
     */
    public static function summarizeLines(array $lines, bool $needsInvoice): array
    {
        $totalUnits = 0;
        $base = 0;
        $parts = [];

        foreach ($lines as $line) {
            $units = (int) ($line['ac_units'] ?? 0);
            $unitPrice = (int) ($line['unit_price'] ?? 0);
            $totalUnits += $units;
            $base += $units * $unitPrice;
            $parts[] = $units.'台'.$unitPrice;
        }

        $cleaningPrice = $needsInvoice ? (int) round($base * 1.05) : $base;

        return [
            'ac_units' => $totalUnits,
            'unit_price' => (int) ($lines[0]['unit_price'] ?? 1500),
            'cleaning_price' => $cleaningPrice,
            'task_details' => implode('+', $parts).'='.$cleaningPrice,
        ];
    }

    /**
     * @param  mixed  $lines
     * @return list<array{ac_units:int, unit_price:int}>
     */
    public static function normalizeLines(mixed $lines, ?int $fallbackUnits = null, ?int $fallbackUnitPrice = null): array
    {
        if (is_array($lines) && $lines !== []) {
            $normalized = [];

            foreach ($lines as $line) {
                if (! is_array($line)) {
                    continue;
                }

                $units = (int) ($line['ac_units'] ?? 0);
                $unitPrice = (int) ($line['unit_price'] ?? 0);

                if ($units < 1 || ! in_array($unitPrice, self::unitPrices(), true)) {
                    continue;
                }

                $normalized[] = [
                    'ac_units' => $units,
                    'unit_price' => $unitPrice,
                ];
            }

            if ($normalized !== []) {
                return $normalized;
            }
        }

        return [[
            'ac_units' => max(1, (int) ($fallbackUnits ?? 1)),
            'unit_price' => in_array((int) ($fallbackUnitPrice ?? 1500), self::unitPrices(), true)
                ? (int) ($fallbackUnitPrice ?? 1500)
                : 1500,
        ]];
    }
}
