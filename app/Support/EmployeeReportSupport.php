<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;

class EmployeeReportSupport
{
    public const POSTAGE_AMOUNT = 28;

    public const INVOICE_SURCHARGE_RATE = 0.05;

    public const INVOICE_TAX_RATE = 0.08;

    /** @var list<string> */
    private const PERSIST_KEYS = [
        'planned_units',
        'completed_units',
        'skipped_units',
        'skip_reason',
        'unit_mismatch',
        'has_tax',
        'needs_invoice_and_mail',
        'needs_receipt_and_mail',
        'temporary_request',
        'temporary_postage',
        'travel_allowance',
        'report_invoice_tax_cost',
        'collected_amount',
        'paid_to_company',
    ];

    /**
     * @param  array<string, mixed>  $input
     */
    public static function createFromSchedule(DailySchedule $schedule, array $input): DailyReport
    {
        $payload = self::buildFromSchedule($schedule, $input);

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            ...self::persistAttributes($payload),
        ]);

        CompanyRemittanceSupport::syncForReport($report);

        FundRoutingService::onReportPosted($report->fresh());

        return $report->fresh();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function applyPayload(DailyReport $report, array $payload): DailyReport
    {
        $report->fill(self::persistAttributes($payload));
        $report->save();

        CompanyRemittanceSupport::syncForReport($report->fresh());

        FundRoutingService::onReportPosted($report->fresh());

        return $report->fresh();
    }

    public static function resyncFromSchedule(
        DailyReport $report,
        array $overrides = [],
        bool $requireSkipReason = false,
        bool $recalculateCollectedAmount = false,
    ): DailyReport {
        $report->loadMissing('dailySchedule');
        $schedule = $report->dailySchedule;

        if (! $schedule) {
            return $report;
        }

        $input = [
            'completed_units' => $report->completed_units,
            'skip_reason' => $report->skip_reason,
            'has_tax' => $report->has_tax,
            'needs_invoice_and_mail' => $report->needs_invoice_and_mail,
            'needs_receipt_and_mail' => $report->needs_receipt_and_mail,
            'temporary_request' => $report->temporary_request,
            'paid_to_company' => $report->paid_to_company,
            'travel_allowance' => $report->travel_allowance,
            ...$overrides,
        ];

        if (! $recalculateCollectedAmount && ! array_key_exists('collected_amount', $overrides)) {
            $input['collected_amount'] = $report->collected_amount;
        }

        $payload = self::buildFromSchedule($schedule, $input, $report, $requireSkipReason);

        return self::applyPayload($report, $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private static function persistAttributes(array $payload): array
    {
        return collect($payload)->only(self::PERSIST_KEYS)->all();
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function buildFromSchedule(
        DailySchedule $schedule,
        array $input,
        ?DailyReport $existingReport = null,
        bool $requireSkipReason = true,
    ): array {
        $plannedUnits = (int) $schedule->ac_units;
        $hasTax = (bool) ($input['has_tax'] ?? false);
        $needsInvoiceAndMail = (bool) ($input['needs_invoice_and_mail'] ?? false);
        $needsReceiptAndMail = (bool) ($input['needs_receipt_and_mail'] ?? false);
        $paidToCompany = (bool) ($input['paid_to_company'] ?? false);

        if ($needsInvoiceAndMail && $needsReceiptAndMail) {
            throw new \InvalidArgumentException('發票寄信與收據寄信不可同時勾選');
        }

        [$needsInvoiceAndMail, $needsReceiptAndMail] = self::resolveMailFlagsFromSchedule(
            $schedule,
            $needsInvoiceAndMail,
            $needsReceiptAndMail,
        );

        $skipReason = trim((string) ($input['skip_reason'] ?? ''));

        if (! empty($input['pricing_lines']) && is_array($input['pricing_lines'])) {
            $lines = SchedulePricing::normalizeLines($input['pricing_lines']);
            $completedUnits = array_sum(array_column($lines, 'ac_units'));
        } else {
            $completedUnits = max(0, (int) ($input['completed_units'] ?? 0));
            $lines = SchedulePricing::normalizeLines(
                $schedule->pricing_lines,
                $schedule->ac_units,
                $schedule->unit_price
            );
            $lines = EmployeeRemittance::scaleLines($lines, $completedUnits, $plannedUnits);
        }

        $skippedUnits = max(0, $plannedUnits - $completedUnits);
        $unitMismatch = $completedUnits !== $plannedUnits;

        if ($requireSkipReason && $unitMismatch && $skipReason === '') {
            throw new \InvalidArgumentException('台數異動需填寫原因');
        }

        if (! $unitMismatch || ! $requireSkipReason) {
            if ($skipReason === '') {
                $skipReason = null;
            }
        }

        $needsInvoice = $hasTax || $needsInvoiceAndMail || (bool) $schedule->needs_invoice;
        $needsMail = $needsInvoiceAndMail
            || $needsReceiptAndMail
            || (bool) $schedule->needs_mail
            || (bool) $schedule->needs_invoice
            || (bool) $schedule->needs_receipt;

        $untaxedBase = 0;

        foreach ($lines as $line) {
            $untaxedBase += (int) $line['ac_units'] * (int) $line['unit_price'];
        }

        $summary = SchedulePricing::summarizeLines($lines, $needsInvoice);
        $baseAmount = $untaxedBase;

        $collectedAmount = array_key_exists('collected_amount', $input)
            ? max(0, (int) $input['collected_amount'])
            : ($paidToCompany ? 0 : $summary['cleaning_price']);

        if ($paidToCompany && $collectedAmount > 0) {
            throw new \InvalidArgumentException('客戶匯款給公司時，實際收取金額請填 0');
        }

        $temporaryPostage = MailRecipientSupport::postageAmountFor(
            $schedule,
            $needsMail,
            $existingReport?->id
        );
        $reportInvoiceTaxCost = (int) ($schedule->hongyi_fee ?? 0);

        if ($reportInvoiceTaxCost === 0) {
            $reportInvoiceTaxCost = (int) ($summary['hongyi_fee'] ?? 0);
        }

        if ($reportInvoiceTaxCost === 0 && ($hasTax || $needsInvoiceAndMail || (bool) $schedule->needs_invoice)) {
            $reportInvoiceTaxCost = (int) round($baseAmount * self::INVOICE_TAX_RATE);
        }

        return [
            'planned_units' => $plannedUnits,
            'completed_units' => $completedUnits,
            'skipped_units' => $skippedUnits,
            'skip_reason' => $skipReason,
            'unit_mismatch' => $unitMismatch,
            'has_tax' => $hasTax,
            'needs_invoice_and_mail' => $needsInvoiceAndMail,
            'needs_receipt_and_mail' => $needsReceiptAndMail,
            'temporary_request' => trim((string) ($input['temporary_request'] ?? '')) ?: null,
            'temporary_postage' => $temporaryPostage,
            'travel_allowance' => max(0, (int) ($input['travel_allowance'] ?? 0)),
            'report_invoice_tax_cost' => $reportInvoiceTaxCost,
            'collected_amount' => $collectedAmount,
            'paid_to_company' => $paidToCompany,
            'needs_invoice' => $needsInvoice,
            'needs_mail' => $needsMail,
            'base_amount' => $baseAmount,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function reportPayload(\App\Models\DailyReport $report): array
    {
        $report->loadMissing(['dailySchedule.user:id,name,account', 'companyRemittance']);
        $financial = CompanyRemittanceSupport::financialBreakdown($report);

        return [
            'id' => $report->id,
            'schedule_id' => $report->schedule_id,
            'planned_units' => $report->planned_units,
            'completed_units' => $report->completed_units,
            'skipped_units' => $report->skipped_units,
            'skip_reason' => $report->skip_reason,
            'unit_mismatch' => (bool) $report->unit_mismatch,
            'has_tax' => (bool) $report->has_tax,
            'needs_invoice_and_mail' => (bool) $report->needs_invoice_and_mail,
            'needs_receipt_and_mail' => (bool) $report->needs_receipt_and_mail,
            'temporary_request' => $report->temporary_request,
            'temporary_postage' => (int) $report->temporary_postage,
            'travel_allowance' => (int) $report->travel_allowance,
            'report_invoice_tax_cost' => (int) $report->report_invoice_tax_cost,
            'collected_amount' => (int) $report->collected_amount,
            'paid_to_company' => (bool) $report->paid_to_company,
            'total_amount' => $financial['total_amount'],
            'employee_received' => $financial['employee_received'],
            'company_inbound_amount' => $financial['company_inbound_amount'],
            'company_remittance' => CompanyRemittanceSupport::reportRemittancePayload($report),
            'created_at' => $report->created_at?->toDateTimeString(),
            'daily_schedule' => $report->dailySchedule,
        ];
    }

    /**
     * @return array{0:bool,1:bool}
     */
    private static function resolveMailFlagsFromSchedule(
        DailySchedule $schedule,
        bool $needsInvoiceAndMail,
        bool $needsReceiptAndMail,
    ): array {
        if ((bool) $schedule->needs_invoice) {
            return [true, false];
        }

        if ((bool) $schedule->needs_receipt) {
            return [false, true];
        }

        if (! $needsInvoiceAndMail && ! $needsReceiptAndMail && (bool) $schedule->needs_mail) {
            return [false, true];
        }

        return [$needsInvoiceAndMail, $needsReceiptAndMail];
    }
}
