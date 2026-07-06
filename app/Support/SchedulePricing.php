<?php

namespace App\Support;

class SchedulePricing
{
    public const INVOICE_TYPE_NONE = 'none';

    public const INVOICE_TYPE_DUPLICATE = 'duplicate';

    public const INVOICE_TYPE_TRIPLICATE = 'triplicate';

    public const CUSTOMER_SURCHARGE_RATE = 0.05;

    public const HONGYI_TAX_RATE = 0.08;

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
            [
                'ac_units' => $acUnits,
                'unit_price' => $unitPrice,
                'invoice_type' => $needsInvoice ? self::INVOICE_TYPE_DUPLICATE : self::INVOICE_TYPE_NONE,
                'charge_customer_tax' => $needsInvoice,
            ],
        ], $needsInvoice)['cleaning_price'];
    }

    /**
     * @param  array<string, mixed>  $line
     */
    public static function lineHasInvoice(array $line): bool
    {
        $type = self::resolveInvoiceType($line);

        return in_array($type, [self::INVOICE_TYPE_DUPLICATE, self::INVOICE_TYPE_TRIPLICATE], true);
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array{
     *     subtotal:int,
     *     customer_amount:int,
     *     hongyi_fee:int,
     *     has_invoice:bool,
     *     charge_customer_tax:bool
     * }
     */
    public static function calculateLineTotals(array $line): array
    {
        $units = (int) ($line['ac_units'] ?? 0);
        $unitPrice = (int) ($line['unit_price'] ?? 0);
        $subtotal = $units * $unitPrice;
        $hasInvoice = self::lineHasInvoice($line);
        $chargeCustomerTax = $hasInvoice && (bool) ($line['charge_customer_tax'] ?? true);
        $customerAmount = $subtotal + ($chargeCustomerTax
            ? (int) round($subtotal * self::CUSTOMER_SURCHARGE_RATE)
            : 0);
        $hongyiFee = $hasInvoice ? (int) round($subtotal * self::HONGYI_TAX_RATE) : 0;

        return [
            'subtotal' => $subtotal,
            'customer_amount' => $customerAmount,
            'hongyi_fee' => $hongyiFee,
            'has_invoice' => $hasInvoice,
            'charge_customer_tax' => $chargeCustomerTax,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @return array{
     *     ac_units:int,
     *     cleaning_price:int,
     *     hongyi_fee:int,
     *     unit_price:int,
     *     task_details:string,
     *     needs_invoice:bool
     * }
     */
    public static function summarizeLines(array $lines, bool $needsInvoice = false): array
    {
        $totalUnits = 0;
        $cleaningPrice = 0;
        $hongyiFee = 0;
        $parts = [];
        $hasInvoicedLine = false;

        foreach ($lines as $line) {
            $units = (int) ($line['ac_units'] ?? 0);
            $unitPrice = (int) ($line['unit_price'] ?? 0);
            $totals = self::calculateLineTotals($line);
            $invoiceType = self::resolveInvoiceType($line);

            $totalUnits += $units;
            $cleaningPrice += $totals['customer_amount'];
            $hongyiFee += $totals['hongyi_fee'];
            $hasInvoicedLine = $hasInvoicedLine || $totals['has_invoice'];

            $suffix = match ($invoiceType) {
                self::INVOICE_TYPE_TRIPLICATE => '(三聯)',
                self::INVOICE_TYPE_DUPLICATE => '(二聯)',
                default => '',
            };

            $parts[] = $units.'台'.$unitPrice.$suffix.($totals['charge_customer_tax'] ? '(含5%)' : '');
        }

        return [
            'ac_units' => $totalUnits,
            'unit_price' => (int) ($lines[0]['unit_price'] ?? 1500),
            'cleaning_price' => $cleaningPrice,
            'hongyi_fee' => $hongyiFee,
            'needs_invoice' => $needsInvoice || $hasInvoicedLine,
            'task_details' => implode('+', $parts).'='.$cleaningPrice,
        ];
    }

    /**
     * @param  mixed  $lines
     * @return list<array{
     *     ac_units:int,
     *     unit_price:int,
     *     is_taxable:bool,
     *     invoice_type:string,
     *     invoice_title:?string,
     *     invoice_tax_id:?string,
     *     charge_customer_tax:bool
     * }>
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

                $invoiceType = self::resolveInvoiceType($line);
                $hasInvoice = self::lineHasInvoice(['invoice_type' => $invoiceType] + $line);
                $chargeCustomerTax = $hasInvoice && (bool) ($line['charge_customer_tax'] ?? true);

                $normalized[] = [
                    'ac_units' => $units,
                    'unit_price' => $unitPrice,
                    'is_taxable' => $hasInvoice && $chargeCustomerTax,
                    'invoice_type' => $invoiceType,
                    'invoice_title' => $invoiceType === self::INVOICE_TYPE_TRIPLICATE
                        ? (trim((string) ($line['invoice_title'] ?? '')) ?: null)
                        : null,
                    'invoice_tax_id' => $invoiceType === self::INVOICE_TYPE_TRIPLICATE
                        ? (trim((string) ($line['invoice_tax_id'] ?? '')) ?: null)
                        : null,
                    'charge_customer_tax' => $chargeCustomerTax,
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
            'invoice_type' => self::INVOICE_TYPE_NONE,
            'invoice_title' => null,
            'invoice_tax_id' => null,
            'charge_customer_tax' => false,
        ]];
    }

    /**
     * @param  array<string, mixed>  $line
     */
    public static function resolveInvoiceType(array $line): string
    {
        $type = $line['invoice_type'] ?? null;

        if (in_array($type, [self::INVOICE_TYPE_NONE, self::INVOICE_TYPE_DUPLICATE, self::INVOICE_TYPE_TRIPLICATE], true)) {
            return $type;
        }

        if ((bool) ($line['is_taxable'] ?? false)) {
            return self::INVOICE_TYPE_DUPLICATE;
        }

        return self::INVOICE_TYPE_NONE;
    }
}
