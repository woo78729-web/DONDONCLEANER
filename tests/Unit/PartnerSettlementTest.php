<?php

namespace Tests\Unit;

use App\Support\MonthlyAccounting;
use PHPUnit\Framework\TestCase;

class PartnerSettlementTest extends TestCase
{
    public function test_atai_income_is_profit_half_without_remittance_adjustment(): void
    {
        $totals = [
            'gross_profit' => 58544,
            'profit_share_half' => 29272,
            'net_from_employees_jobs' => 49344,
            'net_from_employees' => 50594,
            'compensation_due_to_company_total' => 1250,
            'monthly_expense_total' => 2500,
            'company_transfer' => 73500,
            'company_inbound_expected' => 73500,
            'hongyi_payment' => -44228,
            'atai_retained' => 29272,
            'atai_advance_total' => 36100,
            'atai_take_home' => -6828,
            'payment_to_finance_total' => 0,
            'payout_from_finance_total' => 0,
        ];

        $settlement = MonthlyAccounting::partnerSettlement($totals);

        $this->assertSame(29272, $settlement['atai']['income']);
        $this->assertSame(29272, $settlement['atai']['profit_share_half']);
        $this->assertSame(73500, $settlement['hongyi']['customer_remittance_in_account']);
        $this->assertSame(-44228, $settlement['hongyi']['inter_partner_settlement']);
        $this->assertSame(44228, $settlement['atai']['inter_partner_settlement']);
    }

    public function test_compensation_due_counts_toward_company_net_and_gross_profit(): void
    {
        $method = new \ReflectionMethod(MonthlyAccounting::class, 'calculateTotals');
        $method->setAccessible(true);

        /** @var array<string, int> $totals */
        $totals = $method->invoke(
            null,
            [[
                'collect_from_employee' => 20000,
                'advance_to_employee' => 0,
                'company_transfer' => 0,
                'company_inbound_expected' => 0,
                'company_share_due' => 20000,
                'invoice_surcharge_due' => 0,
            ]],
            [[
                'key' => 'expense_control',
                'label' => '管控開支',
                'amount' => 0,
            ]],
            collect([[
                'partner' => 'atai',
                'amount' => 2500,
            ]]),
            0,
            0,
            1250,
        );

        $this->assertSame(20000, $totals['net_from_employees_jobs']);
        $this->assertSame(1250, $totals['compensation_due_to_company_total']);
        $this->assertSame(21250, $totals['net_from_employees']);
        $this->assertSame(18750, $totals['gross_profit']);
        $this->assertSame(9375, $totals['atai_retained']);
        $this->assertSame(9375, $totals['profit_share_half']);
    }

    public function test_inter_partner_settlement_direction(): void
    {
        $settlement = MonthlyAccounting::partnerSettlement([
            'gross_profit' => 60000,
            'profit_share_half' => 30000,
            'net_from_employees_jobs' => 65000,
            'net_from_employees' => 65000,
            'compensation_due_to_company_total' => 0,
            'monthly_expense_total' => 5000,
            'company_inbound_expected' => 20000,
            'invoice_tax_cost' => 500,
            'hongyi_payment' => 10500,
            'atai_advance_total' => 0,
        ]);

        $this->assertSame('dongdong_to_hongyi', $settlement['inter_partner']['direction']);
        $this->assertSame(10500, $settlement['inter_partner']['settlement_amount']);

        $refund = MonthlyAccounting::partnerSettlement([
            'gross_profit' => 60000,
            'profit_share_half' => 30000,
            'net_from_employees_jobs' => 85000,
            'net_from_employees' => 85000,
            'compensation_due_to_company_total' => 0,
            'monthly_expense_total' => 25000,
            'company_inbound_expected' => 40000,
            'invoice_tax_cost' => 8000,
            'hongyi_payment' => -2000,
            'atai_advance_total' => 0,
        ]);

        $this->assertSame('hongyi_to_dongdong', $refund['inter_partner']['direction']);
        $this->assertSame(2000, $refund['inter_partner']['settlement_amount']);
        $this->assertSame(8000, $refund['inter_partner']['invoice_tax_hongyi_advance']);
    }

    public function test_inter_partner_settlement_includes_hongyi_invoice_tax_advance(): void
    {
        $settlement = MonthlyAccounting::partnerSettlement([
            'gross_profit' => -10938,
            'profit_share_half' => -5469,
            'net_from_employees_jobs' => 0,
            'net_from_employees' => 0,
            'compensation_due_to_company_total' => 0,
            'monthly_expense_total' => 10938,
            'company_inbound_expected' => 0,
            'invoice_tax_cost' => 8000,
            'hongyi_payment' => 2531,
            'atai_advance_total' => 0,
        ]);

        $this->assertSame('dongdong_to_hongyi', $settlement['inter_partner']['direction']);
        $this->assertSame(2531, $settlement['inter_partner']['settlement_amount']);
    }
}
