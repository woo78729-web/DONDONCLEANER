<?php

namespace App\Support;

use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Models\FundAccount;
use App\Models\FundTransaction;
use Illuminate\Support\Carbon;

class FundRoutingService
{
    public static function onReportPosted(DailyReport $report): void
    {
        $report->loadMissing('dailySchedule');

        if ((bool) $report->paid_to_company) {
            return;
        }

        $customerPaidTotal = self::customerPaidTotal($report);

        if ($customerPaidTotal <= 0) {
            return;
        }

        $occurredAt = self::reportOccurredAt($report);
        $dongdong = FundLedgerSupport::accountByCode(FundAccount::CODE_DONGDONG);
        $schedule = $report->dailySchedule;

        FundLedgerSupport::postTransfer(
            eventType: FundTransaction::EVENT_CUSTOMER_CASH_IN,
            from: null,
            to: $dongdong,
            amount: $customerPaidTotal,
            idempotencyKey: self::reportIdempotencyKey($report->id, FundTransaction::EVENT_CUSTOMER_CASH_IN),
            sourceType: DailyReport::class,
            sourceId: $report->id,
            occurredAt: $occurredAt,
            meta: [
                'report_id' => $report->id,
                'schedule_id' => $schedule?->id,
                'customer_name' => $schedule?->customer_name,
                'employee_name' => $schedule?->user?->name,
                'collected_amount' => (int) $report->collected_amount,
                'customer_paid_total' => $customerPaidTotal,
            ],
            notes: '客戶現場付現匯入東東帳',
        );

        $invoiceTaxCost = (int) $report->report_invoice_tax_cost;

        if ($invoiceTaxCost > 0) {
            $hongyi = FundLedgerSupport::accountByCode(FundAccount::CODE_HONGYI);

            FundLedgerSupport::postTransfer(
                eventType: FundTransaction::EVENT_INTERNAL_INVOICE_TAX_PAYABLE,
                from: $dongdong,
                to: $hongyi,
                amount: $invoiceTaxCost,
                idempotencyKey: self::reportIdempotencyKey($report->id, FundTransaction::EVENT_INTERNAL_INVOICE_TAX_PAYABLE),
                sourceType: DailyReport::class,
                sourceId: $report->id,
                occurredAt: $occurredAt,
                meta: [
                    'report_id' => $report->id,
                    'schedule_id' => $schedule?->id,
                    'report_invoice_tax_cost' => $invoiceTaxCost,
                ],
                notes: '現金案發票 8% 稅金內部應付（東東帳 → 沒菌垢帳）',
            );
        }

        if ($report->fund_routed_at === null) {
            $report->forceFill(['fund_routed_at' => now()])->save();
        }
    }

    public static function onRemittanceConfirmed(CompanyRemittance $remittance): void
    {
        if ($remittance->status !== CompanyRemittance::STATUS_CONFIRMED) {
            return;
        }

        if ($remittance->fund_transaction_id !== null) {
            return;
        }

        $amount = (int) $remittance->amount;

        if ($amount <= 0) {
            return;
        }

        $remittance->loadMissing(['report.dailySchedule', 'cleaningProject']);
        $hongyi = FundLedgerSupport::accountByCode(FundAccount::CODE_HONGYI);
        $occurredAt = self::remittanceOccurredAt($remittance);
        $payload = CompanyRemittanceSupport::payload($remittance);

        $transaction = FundLedgerSupport::postTransfer(
            eventType: FundTransaction::EVENT_CUSTOMER_REMITTANCE_IN,
            from: null,
            to: $hongyi,
            amount: $amount,
            idempotencyKey: self::remittanceIdempotencyKey($remittance->id),
            sourceType: CompanyRemittance::class,
            sourceId: $remittance->id,
            occurredAt: $occurredAt,
            meta: [
                'remittance_id' => $remittance->id,
                'report_id' => $remittance->report_id,
                'cleaning_project_id' => $remittance->cleaning_project_id,
                'customer_name' => $payload['customer_name'],
                'employee_name' => $payload['employee_name'],
                'expected_remittance_date' => $payload['expected_remittance_date'],
            ],
            notes: '客戶匯款確認入沒菌垢帳',
        );

        $remittance->forceFill([
            'fund_transaction_id' => $transaction->id,
            'destination_account_id' => $hongyi->id,
        ])->save();
    }

    public static function customerPaidTotal(DailyReport $report): int
    {
        if ((bool) $report->paid_to_company) {
            return 0;
        }

        if ((int) $report->collected_amount > 0) {
            return (int) $report->collected_amount;
        }

        $report->loadMissing('dailySchedule');
        $schedule = $report->dailySchedule;

        if (! $schedule) {
            return 0;
        }

        $lines = SchedulePricing::normalizeLines(
            $schedule->pricing_lines,
            $schedule->ac_units,
            $schedule->unit_price,
        );
        $lines = EmployeeRemittance::scaleLines(
            $lines,
            (int) $report->completed_units,
            (int) $schedule->ac_units,
        );

        $needsInvoice = (bool) $report->has_tax
            || (bool) $report->needs_invoice_and_mail
            || (bool) $schedule->needs_invoice;

        return (int) SchedulePricing::summarizeLines($lines, $needsInvoice)['cleaning_price'];
    }

    public static function reportIdempotencyKey(int $reportId, string $eventType): string
    {
        return "report:{$reportId}:{$eventType}";
    }

    public static function remittanceIdempotencyKey(int $remittanceId): string
    {
        return "remittance:{$remittanceId}:".FundTransaction::EVENT_CUSTOMER_REMITTANCE_IN;
    }

    private static function reportOccurredAt(DailyReport $report): Carbon
    {
        $report->loadMissing('dailySchedule');
        $workDate = $report->dailySchedule?->work_date;

        if ($workDate !== null) {
            return Carbon::parse($workDate)->startOfDay();
        }

        return ($report->updated_at ?? now())->copy()->startOfDay();
    }

    private static function remittanceOccurredAt(CompanyRemittance $remittance): Carbon
    {
        if ($remittance->confirmed_at !== null) {
            return $remittance->confirmed_at->copy()->startOfDay();
        }

        if ($remittance->expected_remittance_date !== null) {
            return $remittance->expected_remittance_date->copy()->startOfDay();
        }

        return ($remittance->updated_at ?? now())->copy()->startOfDay();
    }
}
