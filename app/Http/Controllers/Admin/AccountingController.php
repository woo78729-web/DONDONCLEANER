<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountingSetting;
use App\Models\ManualPostageEntry;
use App\Models\MonthlyAdvanceEntry;
use App\Support\MailPostageAccounting;
use App\Support\EmployeeSettlementLedger;
use App\Support\MonthlyAccounting;
use App\Support\MonthlyFixedExpenseSupport;
use App\Support\UnitPerformanceReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountingController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $yearMonth = $validated['year_month'] ?? now()->format('Y-m');

        return $this->success(
            MonthlyAccounting::buildSummary($yearMonth),
            '記帳總表查詢成功'
        );
    }

    public function unitPerformance(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'to_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
        ]);

        return $this->success(
            UnitPerformanceReport::build(
                $validated['from_year'] ?? null,
                $validated['to_year'] ?? null,
            ),
            '歷年台數績效查詢成功'
        );
    }

    public function settlementLedger(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $yearMonth = $validated['year_month'] ?? now()->format('Y-m');

        return $this->success(
            EmployeeSettlementLedger::build($yearMonth, isset($validated['user_id']) ? (int) $validated['user_id'] : null),
            '結算明細表查詢成功'
        );
    }

    public function updateSettings(Request $request): JsonResponse
    {
        MonthlyAccounting::ensureDefaultSettings();

        $validated = $request->validate([
            'year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'expenses' => ['required', 'array', 'min:1'],
            'expenses.*.key' => ['required', 'string', Rule::exists('accounting_settings', 'key')],
            'expenses.*.amount' => ['required', 'integer', 'min:0'],
            'expenses.*.label' => ['sometimes', 'string', 'max:100'],
        ]);

        foreach ($validated['expenses'] as $expense) {
            if (! array_key_exists('label', $expense)) {
                continue;
            }

            AccountingSetting::query()
                ->where('key', $expense['key'])
                ->update(['label' => $expense['label']]);
        }

        MonthlyFixedExpenseSupport::saveForMonth(
            $validated['year_month'],
            $validated['expenses'],
        );

        return $this->success(
            MonthlyAccounting::buildSummary($validated['year_month']),
            '固定開支已更新'
        );
    }

    public function storeAdvance(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'partner' => ['required', Rule::in(MonthlyAccounting::partners())],
            'label' => ['required', 'string', 'max:100'],
            'amount' => ['required', 'integer'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $entry = MonthlyAdvanceEntry::query()->create($validated);

        return $this->success([
            'entry' => $this->advancePayload($entry),
            'summary' => MonthlyAccounting::buildSummary($validated['year_month']),
        ], '代墊款已新增', 201);
    }

    public function updateAdvance(Request $request, MonthlyAdvanceEntry $advance): JsonResponse
    {
        $validated = $request->validate([
            'partner' => ['sometimes', Rule::in(MonthlyAccounting::partners())],
            'label' => ['sometimes', 'string', 'max:100'],
            'amount' => ['sometimes', 'integer'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $advance->fill($validated);
        $advance->save();

        return $this->success([
            'entry' => $this->advancePayload($advance),
            'summary' => MonthlyAccounting::buildSummary($advance->year_month),
        ], '代墊款已更新');
    }

    public function destroyAdvance(MonthlyAdvanceEntry $advance): JsonResponse
    {
        $yearMonth = $advance->year_month;
        $advance->delete();

        return $this->success(
            MonthlyAccounting::buildSummary($yearMonth),
            '代墊款已刪除'
        );
    }

    public function storeManualPostage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
            'mailed_at' => ['nullable', 'date'],
            'amount' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'billing_amount' => ['nullable', 'integer', 'min:0', 'max:9999999'],
            'needs_receipt' => ['nullable', 'boolean'],
            'needs_invoice' => ['nullable', 'boolean'],
            'invoice_charge_customer_tax' => ['nullable', 'boolean'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'mail_tracking_number' => ['nullable', 'string', 'max:100'],
            'mail_recipient' => ['required', 'string', 'max:255'],
            'mail_phone' => ['required', 'string', 'max:50'],
            'mail_address' => ['required', 'string', 'max:255'],
            'notes' => ['required', 'string', 'max:255'],
            'as_pending' => ['nullable', 'boolean'],
            'invoice_sent' => ['nullable', 'boolean'],
        ]);

        // 預設進待寄清單；舊呼叫若直接帶 mailed_at 仍視為已寄出補登
        $asPending = $request->has('as_pending')
            ? $request->boolean('as_pending')
            : ! $request->filled('mailed_at');

        $markSent = ! $asPending && $request->boolean('invoice_sent', true);
        $mailedAt = $markSent
            ? MailPostageAccounting::resolveMailedAt($validated['mailed_at'] ?? null, true)
            : null;
        $yearMonth = $validated['year_month']
            ?? ($mailedAt ? substr((string) $mailedAt, 0, 7) : now()->format('Y-m'));

        $needsReceipt = array_key_exists('needs_receipt', $validated)
            ? (bool) $validated['needs_receipt']
            : true;
        $needsInvoice = array_key_exists('needs_invoice', $validated)
            ? (bool) $validated['needs_invoice']
            : false;

        if (! $needsReceipt && ! $needsInvoice) {
            $needsReceipt = true;
        }

        $entry = ManualPostageEntry::query()->create([
            'year_month' => $yearMonth,
            'mailed_at' => $mailedAt,
            'amount' => $validated['amount'] ?? MonthlyAccounting::POSTAGE_UNIT,
            'billing_amount' => (int) ($validated['billing_amount'] ?? 0),
            'needs_receipt' => $needsReceipt,
            'needs_invoice' => $needsInvoice,
            'invoice_charge_customer_tax' => (bool) ($validated['invoice_charge_customer_tax'] ?? false),
            'mail_recipient' => trim($validated['mail_recipient']),
            'mail_phone' => trim($validated['mail_phone']),
            'mail_address' => trim($validated['mail_address']),
            'invoice_title' => trim((string) ($validated['invoice_title'] ?? '')) ?: null,
            'invoice_tax_id' => trim((string) ($validated['invoice_tax_id'] ?? '')) ?: null,
            'mail_tracking_number' => trim((string) ($validated['mail_tracking_number'] ?? '')) ?: null,
            'notes' => trim($validated['notes']),
            'invoice_sent' => $markSent,
            'created_by' => $request->user()->id,
        ]);

        $summaryMonth = $entry->mailed_at?->format('Y-m') ?? $entry->year_month;

        return $this->success([
            'entry' => MailPostageAccounting::manualPostagePayload($entry),
            'summary' => MonthlyAccounting::buildSummary($summaryMonth),
        ], $markSent ? '補寄郵資已新增' : '補寄項目已加入待寄清單', 201);
    }

    public function updateManualPostage(Request $request, ManualPostageEntry $manualPostage): JsonResponse
    {
        $validated = $request->validate([
            'mailed_at' => ['nullable', 'date'],
            'amount' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'billing_amount' => ['nullable', 'integer', 'min:0', 'max:9999999'],
            'needs_receipt' => ['nullable', 'boolean'],
            'needs_invoice' => ['nullable', 'boolean'],
            'invoice_charge_customer_tax' => ['nullable', 'boolean'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'mail_tracking_number' => ['nullable', 'string', 'max:100'],
            'mail_recipient' => ['nullable', 'string', 'max:255'],
            'mail_phone' => ['nullable', 'string', 'max:50'],
            'mail_address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:255'],
            'invoice_sent' => ['nullable', 'boolean'],
        ]);

        foreach (['mail_recipient', 'mail_phone', 'mail_address', 'notes', 'invoice_title', 'invoice_tax_id', 'mail_tracking_number'] as $field) {
            if (array_key_exists($field, $validated)) {
                $value = trim((string) ($validated[$field] ?? ''));
                $manualPostage->{$field} = $value !== '' ? $value : null;
            }
        }

        if (array_key_exists('amount', $validated) && $validated['amount'] !== null) {
            $manualPostage->amount = (int) $validated['amount'];
        }

        if (array_key_exists('billing_amount', $validated) && $validated['billing_amount'] !== null) {
            $manualPostage->billing_amount = (int) $validated['billing_amount'];
        }

        if (array_key_exists('needs_receipt', $validated)) {
            $manualPostage->needs_receipt = (bool) $validated['needs_receipt'];
        }

        if (array_key_exists('needs_invoice', $validated)) {
            $manualPostage->needs_invoice = (bool) $validated['needs_invoice'];
        }

        if (array_key_exists('invoice_charge_customer_tax', $validated)) {
            $manualPostage->invoice_charge_customer_tax = (bool) $validated['invoice_charge_customer_tax'];
        }

        if (! $manualPostage->needs_receipt && ! $manualPostage->needs_invoice) {
            $manualPostage->needs_receipt = true;
        }

        $wasSent = (bool) $manualPostage->invoice_sent;
        $markSent = array_key_exists('invoice_sent', $validated)
            ? (bool) $validated['invoice_sent']
            : $wasSent;

        if ($markSent) {
            $manualPostage->invoice_sent = true;
            $manualPostage->mailed_at = MailPostageAccounting::resolveMailedAt(
                $validated['mailed_at'] ?? $manualPostage->mailed_at?->format('Y-m-d'),
                true,
            );
            $manualPostage->year_month = substr((string) $manualPostage->mailed_at, 0, 7);
        } elseif ($wasSent && ! $markSent) {
            $manualPostage->invoice_sent = false;
            $manualPostage->mailed_at = null;
        } elseif (array_key_exists('mailed_at', $validated) && $validated['mailed_at']) {
            $manualPostage->mailed_at = $validated['mailed_at'];
            $manualPostage->year_month = substr((string) $validated['mailed_at'], 0, 7);
        }

        $manualPostage->save();

        $summaryMonth = $manualPostage->mailed_at?->format('Y-m') ?? $manualPostage->year_month;

        return $this->success([
            'entry' => MailPostageAccounting::manualPostagePayload($manualPostage->fresh()),
            'summary' => MonthlyAccounting::buildSummary($summaryMonth),
        ], $markSent && ! $wasSent ? '補寄已標記寄出完成' : '補寄資料已更新');
    }

    public function destroyManualPostage(ManualPostageEntry $manualPostage): JsonResponse
    {
        $yearMonth = $manualPostage->mailed_at?->format('Y-m') ?? $manualPostage->year_month;
        $manualPostage->delete();

        return $this->success(
            MonthlyAccounting::buildSummary($yearMonth),
            '補寄郵資已刪除'
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function advancePayload(MonthlyAdvanceEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'year_month' => $entry->year_month,
            'partner' => $entry->partner,
            'partner_label' => MonthlyAccounting::partnerLabel($entry->partner),
            'label' => $entry->label,
            'amount' => $entry->amount,
            'notes' => $entry->notes,
        ];
    }
}
