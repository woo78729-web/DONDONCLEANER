<?php

namespace Tests\Unit;

use App\Support\MonthlyAccounting;
use PHPUnit\Framework\TestCase;

class MonthlyAccountingSettlementTest extends TestCase
{
    public function test_hongyi_payment_splits_gross_profit_and_counts_invoice_tax_as_hongyi_advance(): void
    {
        $employees = [[
            'collect_from_employee' => 20000,
            'advance_to_employee' => 0,
            'company_transfer' => 0,
            'company_inbound_expected' => 0,
            'company_share_due' => 20000,
            'invoice_surcharge_due' => 0,
            'remittance_company_share' => 0,
            'invoice_tax_cost' => 500,
        ]];

        $fixedExpenses = [[
            'key' => 'expense_control',
            'label' => '管控開支',
            'amount' => 0,
        ]];

        $totals = $this->invokeCalculateTotals($employees, $fixedExpenses, [], 0, 500);

        $this->assertSame(500, $totals['invoice_tax_cost']);
        $this->assertSame(500, $totals['auto_invoice_tax_advance']);
        $this->assertSame(0, $totals['atai_advance_total']);
        $this->assertSame(500, $totals['hongyi_advance_total']);
        $this->assertSame(9750, $totals['atai_net_balance']);
        $this->assertSame(19500, $totals['gross_profit']);
        $this->assertSame(10250, $totals['hongyi_payment']);
        $this->assertSame(9750, $totals['atai_retained']);
        $this->assertSame(9750, $totals['profit_share_half']);
    }

    public function test_fixed_expenses_count_toward_atai_advance_total(): void
    {
        $totals = $this->invokeCalculateTotals([], [[
            'key' => 'expense_control',
            'label' => '管控開支',
            'amount' => 8000,
        ]], [], 0, 0);

        $this->assertSame(8000, $totals['fixed_expense_total']);
        $this->assertSame(8000, $totals['atai_advance_fixed_total']);
        $this->assertSame(8000, $totals['atai_advance_total']);
        $this->assertSame(-12000, $totals['atai_net_balance']);
    }

    public function test_auto_postage_is_added_when_mail_reports_exist(): void
    {
        $totals = $this->invokeCalculateTotals([], [[
            'key' => 'expense_control',
            'label' => '管控開支',
            'amount' => 0,
        ]], [], 28, 0);

        $this->assertSame(28, $totals['auto_postage']);
        $this->assertSame(28, $totals['monthly_expense_total']);
    }

    public function test_gross_profit_matches_excel_company_share_plus_customer_surcharge(): void
    {
        $totals = $this->invokeCalculateTotals(
            [[
                'collect_from_employee' => 50000,
                'advance_to_employee' => 69600,
                'company_inbound_expected' => 112350,
                'company_share_due' => 135300,
                'invoice_surcharge_due' => 6050,
                'remittance_company_share' => 46400,
            ]],
            [[
                'key' => 'expense_ad',
                'label' => '廣告',
                'amount' => 10500,
            ], [
                'key' => 'expense_control',
                'label' => '管控開支',
                'amount' => 7000,
            ]],
            [],
            112,
            9680,
        );

        $this->assertSame(135300, $totals['company_share_total']);
        $this->assertSame(6050, $totals['customer_invoice_surcharge_total']);
        $this->assertSame(46400, $totals['remittance_company_share_total']);
        $this->assertSame(141350, $totals['operating_income']);
        $this->assertSame(114058, $totals['gross_profit']);
        $this->assertSame(57029, $totals['profit_share_half']);
        $this->assertSame(-45641, $totals['hongyi_payment']);
    }

    public function test_travel_allowance_counts_toward_atai_advance_and_monthly_expense(): void
    {
        $totals = $this->invokeCalculateTotals([], [[
            'key' => 'expense_control',
            'label' => '管控開支',
            'amount' => 0,
        ]], [], 0, 0, 0, 1500);

        $this->assertSame(1500, $totals['travel_allowance_total']);
        $this->assertSame(1500, $totals['auto_travel_allowance_advance']);
        $this->assertSame(1500, $totals['atai_advance_total']);
        $this->assertSame(1500, $totals['monthly_expense_total']);
        $this->assertSame(-1500, $totals['gross_profit']);
        $this->assertSame(-750, $totals['profit_share_half']);
    }

    /**
     * @param  list<array<string, mixed>>  $employees
     * @param  list<array<string, mixed>>  $fixedExpenses
     * @param  list<array<string, mixed>>  $manualAdvanceEntries
     * @return array<string, int>
     */
    private function invokeCalculateTotals(
        array $employees,
        array $fixedExpenses,
        array $manualAdvanceEntries,
        int $autoPostage = 0,
        int $autoInvoiceTax = 0,
        int $compensationDueToCompany = 0,
        int $travelAllowanceTotal = 0,
    ): array {
        $method = new \ReflectionMethod(MonthlyAccounting::class, 'calculateTotals');
        $method->setAccessible(true);

        /** @var array<string, int> $result */
        $result = $method->invoke(
            null,
            $employees,
            $fixedExpenses,
            collect($manualAdvanceEntries),
            $autoPostage,
            $autoInvoiceTax,
            $compensationDueToCompany,
            $travelAllowanceTotal,
        );

        return $result;
    }
}
