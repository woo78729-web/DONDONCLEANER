<?php

namespace Tests\Unit;

use App\Support\EmployeeRemittance;
use App\Support\SchedulePricing;
use PHPUnit\Framework\TestCase;

class EmployeeRemittanceTest extends TestCase
{
    public function test_summarize_report_for_cash_collection(): void
    {
        $summary = EmployeeRemittance::summarizeReport(
            [['ac_units' => 40, 'unit_price' => 1000]],
            40,
            40,
            false,
            false,
        );

        $this->assertSame(16000, $summary['collect_from_employee']);
        $this->assertSame(16000, $summary['company_share_due']);
        $this->assertSame(0, $summary['advance_to_employee']);
    }

    public function test_summarize_report_for_company_transfer(): void
    {
        $summary = EmployeeRemittance::summarizeReport(
            [['ac_units' => 10, 'unit_price' => 1000]],
            10,
            10,
            true,
            false,
        );

        $this->assertSame(0, $summary['collect_from_employee']);
        $this->assertSame(4000, $summary['company_share_due']);
        $this->assertSame(4000, $summary['remittance_company_share']);
        $this->assertSame(6000, $summary['advance_to_employee']);
        $this->assertSame(10000, $summary['company_transfer']);
    }

    public function test_invoice_tax_cost_uses_eight_percent_of_base(): void
    {
        $summary = EmployeeRemittance::summarizeReport(
            [['ac_units' => 1, 'unit_price' => 1000]],
            1,
            1,
            false,
            true,
        );

        $this->assertSame(80, $summary['invoice_tax_cost']);
        $this->assertSame(50, $summary['invoice_surcharge_due']);
        $this->assertSame(450, $summary['collect_from_employee']);
    }

    public function test_invoice_surcharge_is_included_in_company_transfer_not_cash_collect(): void
    {
        $summary = EmployeeRemittance::summarizeReport(
            [[
                'ac_units' => 10,
                'unit_price' => 1000,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            10,
            10,
            true,
            true,
        );

        $this->assertSame(500, $summary['invoice_surcharge_due']);
        $this->assertSame(4000, $summary['company_share_due']);
        $this->assertSame(4000, $summary['remittance_company_share']);
        $this->assertSame(10500, $summary['company_transfer']);
        $this->assertSame(0, $summary['collect_from_employee']);
    }

    public function test_company_transfer_respects_charge_customer_tax_false(): void
    {
        $summary = EmployeeRemittance::summarizeReport(
            [[
                'ac_units' => 13,
                'unit_price' => 1000,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => false,
            ]],
            13,
            13,
            true,
            true,
        );

        $this->assertSame(0, $summary['invoice_surcharge_due']);
        $this->assertSame(13000, $summary['company_transfer']);
    }
}
