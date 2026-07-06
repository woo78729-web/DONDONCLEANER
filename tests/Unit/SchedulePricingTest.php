<?php

namespace Tests\Unit;

use App\Support\SchedulePricing;
use PHPUnit\Framework\TestCase;

class SchedulePricingTest extends TestCase
{
    public function test_summarize_lines_calculates_per_line_customer_and_hongyi_totals(): void
    {
        $summary = SchedulePricing::summarizeLines([
            [
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_NONE,
            ],
            [
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ],
            [
                'ac_units' => 1,
                'unit_price' => 1000,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => false,
            ],
        ]);

        $this->assertSame(4, $summary['ac_units']);
        $this->assertSame(5575, $summary['cleaning_price']);
        $this->assertSame(200, $summary['hongyi_fee']);
    }

    public function test_triplicate_line_includes_title_and_tax_id_in_normalized_lines(): void
    {
        $lines = SchedulePricing::normalizeLines([
            [
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_TRIPLICATE,
                'invoice_title' => '測試公司',
                'invoice_tax_id' => '12345678',
                'charge_customer_tax' => true,
            ],
        ]);

        $this->assertSame('triplicate', $lines[0]['invoice_type']);
        $this->assertSame('測試公司', $lines[0]['invoice_title']);
        $this->assertSame('12345678', $lines[0]['invoice_tax_id']);
        $this->assertSame(3150, SchedulePricing::summarizeLines($lines)['cleaning_price']);
        $this->assertSame(240, SchedulePricing::summarizeLines($lines)['hongyi_fee']);
    }
}
