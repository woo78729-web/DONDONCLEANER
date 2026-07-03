<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountingSetting;
use App\Models\MonthlyAdvanceEntry;
use App\Support\MonthlyAccounting;
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

    public function updateSettings(Request $request): JsonResponse
    {
        MonthlyAccounting::ensureDefaultSettings();

        $validated = $request->validate([
            'expenses' => ['required', 'array', 'min:1'],
            'expenses.*.key' => ['required', 'string', Rule::exists('accounting_settings', 'key')],
            'expenses.*.amount' => ['required', 'integer', 'min:0'],
            'expenses.*.label' => ['sometimes', 'string', 'max:100'],
        ]);

        foreach ($validated['expenses'] as $expense) {
            $payload = ['amount' => $expense['amount']];

            if (array_key_exists('label', $expense)) {
                $payload['label'] = $expense['label'];
            }

            AccountingSetting::query()
                ->where('key', $expense['key'])
                ->update($payload);
        }

        $yearMonth = $request->input('year_month', now()->format('Y-m'));

        return $this->success(
            MonthlyAccounting::buildSummary((string) $yearMonth),
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
