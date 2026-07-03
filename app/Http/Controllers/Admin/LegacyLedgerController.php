<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\LegacyLedgerSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LegacyLedgerController extends Controller
{
    public function trends(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'to_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
        ]);

        return $this->success(
            LegacyLedgerSupport::buildYearlyTrends(
                $validated['from_year'] ?? null,
                $validated['to_year'] ?? null,
            ),
            '歷年績效趨勢查詢成功',
        );
    }

    public function months(): JsonResponse
    {
        LegacyLedgerSupport::ensureGroups();

        return $this->success([
            'months' => LegacyLedgerSupport::listMonths(),
            'groups' => LegacyLedgerSupport::GROUP_DEFINITIONS,
        ], '舊帳月份列表查詢成功');
    }

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        return $this->success(
            LegacyLedgerSupport::buildMonthDetail($validated['year_month']),
            '月份帳表查詢成功',
        );
    }

    public function import(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'source' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:500'],
            'groups' => ['required', 'array', 'min:1'],
            'groups.*.group_key' => ['required', 'string', Rule::in(['jun', 'qian'])],
            'groups.*.daily_units' => ['nullable', 'array'],
            'groups.*.total_revenue' => ['nullable', 'integer'],
            'groups.*.gross_profit' => ['nullable', 'integer'],
            'groups.*.net_profit' => ['nullable', 'integer'],
            'groups.*.hongyi_share' => ['nullable', 'integer'],
            'advances' => ['nullable', 'array'],
            'advances.*.partner' => ['required_with:advances', Rule::in(['atai', 'hongyi'])],
            'advances.*.label' => ['required_with:advances', 'string', 'max:100'],
            'advances.*.amount' => ['required_with:advances', 'integer'],
        ]);

        return $this->success(
            LegacyLedgerSupport::importMonth($validated),
            '舊帳資料已匯入',
            201,
        );
    }

    public function importBulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'months' => ['required', 'array', 'min:1'],
            'months.*.year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'months.*.source' => ['nullable', 'string', 'max:30'],
            'months.*.notes' => ['nullable', 'string', 'max:500'],
            'months.*.groups' => ['required', 'array', 'min:1'],
            'months.*.groups.*.group_key' => ['required', 'string', Rule::in(['jun', 'qian'])],
            'months.*.groups.*.daily_units' => ['nullable', 'array'],
            'months.*.groups.*.total_revenue' => ['nullable', 'integer'],
            'months.*.groups.*.gross_profit' => ['nullable', 'integer'],
            'months.*.groups.*.net_profit' => ['nullable', 'integer'],
            'months.*.groups.*.hongyi_share' => ['nullable', 'integer'],
            'months.*.advances' => ['nullable', 'array'],
            'months.*.advances.*.partner' => ['required_with:months.*.advances', Rule::in(['atai', 'hongyi'])],
            'months.*.advances.*.label' => ['required_with:months.*.advances', 'string', 'max:100'],
            'months.*.advances.*.amount' => ['required_with:months.*.advances', 'integer'],
        ]);

        return $this->success(
            LegacyLedgerSupport::importBulk($validated['months']),
            '整年度舊帳已匯入',
            201,
        );
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['required', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        LegacyLedgerSupport::deleteMonth($validated['year_month']);

        return $this->success(null, '舊帳資料已刪除');
    }
}
