<?php

namespace App\Support;

class EmployeeRemittance
{
    public const INVOICE_SURCHARGE_RATE = 0.05;

    public const INVOICE_TAX_RATE = 0.08;

    /**
     * @return array<int, int>
     */
    public static function remittanceMap(): array
    {
        return [
            1500 => 600,
            1300 => 500,
            1000 => 400,
        ];
    }

    public static function remittancePerUnit(int $unitPrice): int
    {
        return self::remittanceMap()[$unitPrice]
            ?? self::remittanceMap()[SchedulePricing::unitPrices()[0]];
    }

    public static function employeeSharePerUnit(int $unitPrice): int
    {
        return $unitPrice - self::remittancePerUnit($unitPrice);
    }

    /**
     * @return array{1500:int, 1300:int, 1000:int}
     */
    public static function emptyTierUnitCounts(): array
    {
        return [
            1500 => 0,
            1300 => 0,
            1000 => 0,
        ];
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @return array{1500:int, 1300:int, 1000:int}
     */
    public static function tierUnitCounts(array $lines): array
    {
        $counts = self::emptyTierUnitCounts();

        foreach ($lines as $line) {
            $unitPrice = (int) $line['unit_price'];

            if (! array_key_exists($unitPrice, $counts)) {
                continue;
            }

            $counts[$unitPrice] += (int) $line['ac_units'];
        }

        return $counts;
    }

    /**
     * @param  array{1500:int, 1300:int, 1000:int}  $base
     * @param  array{1500:int, 1300:int, 1000:int}  $delta
     * @return array{1500:int, 1300:int, 1000:int}
     */
    public static function mergeTierUnitCounts(array $base, array $delta): array
    {
        foreach ($delta as $unitPrice => $units) {
            if (! array_key_exists($unitPrice, $base)) {
                continue;
            }

            $base[$unitPrice] += (int) $units;
        }

        return $base;
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @return list<array{ac_units:int, unit_price:int}>
     */
    public static function scaleLines(array $lines, int $completedUnits, int $scheduledUnits): array
    {
        if ($lines === []) {
            return [];
        }

        if ($scheduledUnits < 1 || $completedUnits === $scheduledUnits) {
            return $lines;
        }

        $ratio = $completedUnits / $scheduledUnits;
        $scaled = [];
        $assigned = 0;

        foreach ($lines as $index => $line) {
            if ($index === array_key_last($lines)) {
                $units = max(0, $completedUnits - $assigned);
            } else {
                $units = max(0, (int) round($line['ac_units'] * $ratio));
                $assigned += $units;
            }

            if ($units < 1) {
                continue;
            }

            $scaled[] = [
                'ac_units' => $units,
                'unit_price' => (int) $line['unit_price'],
            ];
        }

        if ($scaled === [] && $completedUnits > 0) {
            $scaled[] = [
                'ac_units' => $completedUnits,
                'unit_price' => (int) $lines[0]['unit_price'],
            ];
        }

        return $scaled;
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @return array{
     *     collect_from_employee:int,
     *     advance_to_employee:int,
     *     company_transfer:int,
     *     company_share_due:int,
     *     remittance_company_share:int,
     *     invoice_surcharge_due:int,
     *     invoice_tax_cost:int,
     *     completed_units:int
     * }
     */
    public static function summarizeReport(
        array $lines,
        int $completedUnits,
        int $scheduledUnits,
        bool $paidToCompany,
        bool $needsInvoice,
    ): array {
        $scaledLines = self::scaleLines($lines, $completedUnits, $scheduledUnits);

        $collectFromEmployee = 0;
        $advanceToEmployee = 0;
        $companyTransfer = 0;
        $companyShareDue = 0;
        $remittanceCompanyShare = 0;
        $invoiceSurchargeDue = 0;
        $invoiceTaxCost = 0;
        $unitsTotal = 0;

        foreach ($scaledLines as $line) {
            $units = (int) $line['ac_units'];
            $unitPrice = (int) $line['unit_price'];
            $unitsTotal += $units;

            $base = $units * $unitPrice;
            $companyShare = $units * self::remittancePerUnit($unitPrice);
            $companyShareDue += $companyShare;

            if ($paidToCompany) {
                $remittanceCompanyShare += $companyShare;
            }

            $customerAmount = $needsInvoice
                ? (int) round($base * (1 + self::INVOICE_SURCHARGE_RATE))
                : $base;

            if ($needsInvoice) {
                $surcharge = (int) round($base * self::INVOICE_SURCHARGE_RATE);
                $invoiceSurchargeDue += $surcharge;
                $invoiceTaxCost += (int) round($base * self::INVOICE_TAX_RATE);

                if (! $paidToCompany) {
                    $collectFromEmployee += $surcharge;
                }
            }

            if ($paidToCompany) {
                $advanceToEmployee += $units * self::employeeSharePerUnit($unitPrice);
                $companyTransfer += $customerAmount;
            } else {
                $collectFromEmployee += $companyShare;
            }
        }

        return [
            'collect_from_employee' => $collectFromEmployee,
            'advance_to_employee' => $advanceToEmployee,
            'company_transfer' => $companyTransfer,
            'company_share_due' => $companyShareDue,
            'remittance_company_share' => $remittanceCompanyShare,
            'invoice_surcharge_due' => $invoiceSurchargeDue,
            'invoice_tax_cost' => $invoiceTaxCost,
            'completed_units' => $unitsTotal,
        ];
    }
}
