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
            ['ac_units' => $acUnits, 'unit_price' => $unitPrice, 'is_taxable' => $needsInvoice],
        ], $needsInvoice)['cleaning_price'];
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int, is_taxable?:bool}>  $lines
     * @return array{ac_units:int, cleaning_price:int, unit_price:int, task_details:string, needs_invoice:bool}
     */
    public static function summarizeLines(array $lines, bool $needsInvoice = false): array
    {
        $totalUnits = 0;
        $cleaningPrice = 0;
        $parts = [];
        $hasTaxableLine = false;

        foreach ($lines as $line) {
            $units = (int) ($line['ac_units'] ?? 0);
            $unitPrice = (int) ($line['unit_price'] ?? 0);
            $lineBase = $units * $unitPrice;
            $isTaxable = (bool) ($line['is_taxable'] ?? false);
            $lineTotal = $isTaxable ? (int) round($lineBase * 1.05) : $lineBase;

            $totalUnits += $units;
            $cleaningPrice += $lineTotal;
            $hasTaxableLine = $hasTaxableLine || $isTaxable;
            $parts[] = $units.'台'.$unitPrice.($isTaxable ? '(含稅)' : '');
        }

        return [
            'ac_units' => $totalUnits,
            'unit_price' => (int) ($lines[0]['unit_price'] ?? 1500),
            'cleaning_price' => $cleaningPrice,
            'needs_invoice' => $needsInvoice || $hasTaxableLine,
            'task_details' => implode('+', $parts).'='.$cleaningPrice,
        ];
    }

    /**
     * @param  mixed  $lines
     * @return list<array{ac_units:int, unit_price:int, is_taxable:bool}>
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
                    'is_taxable' => (bool) ($line['is_taxable'] ?? false),
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
            'is_taxable' => false,
        ]];
    }
}
