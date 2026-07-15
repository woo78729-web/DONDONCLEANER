<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CompanyRemittance;
use App\Support\CompanyRemittanceSupport;
use App\Support\FundRoutingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class RemittanceTrackingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $yearMonth = $validated['year_month'] ?? now()->format('Y-m');
        [$year, $month] = array_pad(explode('-', $yearMonth), 2, null);

        CompanyRemittanceSupport::syncForMonth((int) $year, (int) $month);

        $pending = CompanyRemittanceSupport::monthQuery((int) $year, (int) $month)
            ->with(['report.dailySchedule.user:id,name,account', 'report.dailySchedule.cleaningProject'])
            ->whereIn('status', [CompanyRemittance::STATUS_PENDING, CompanyRemittance::STATUS_REMINDED])
            ->orderBy('expected_remittance_date')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->map(fn (CompanyRemittance $item) => CompanyRemittanceSupport::payload($item))
            ->values();

        $confirmed = CompanyRemittanceSupport::monthQuery((int) $year, (int) $month)
            ->with(['report.dailySchedule.user:id,name,account', 'report.dailySchedule.cleaningProject'])
            ->where('status', CompanyRemittance::STATUS_CONFIRMED)
            ->orderByDesc('confirmed_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (CompanyRemittance $item) => CompanyRemittanceSupport::payload($item))
            ->values();

        return $this->success([
            'year_month' => $yearMonth,
            'pending' => $pending,
            'confirmed' => $confirmed,
            'totals' => [
                'pending_amount' => (int) $pending->sum('amount'),
                'confirmed_amount' => (int) $confirmed->sum('amount'),
            ],
        ], '匯款追查查詢成功');
    }

    public function alerts(Request $request): JsonResponse
    {
        $items = CompanyRemittanceSupport::overdueQuery()
            ->orderBy('created_at')
            ->get()
            ->filter(fn (CompanyRemittance $item) => CompanyRemittanceSupport::isOverdue($item))
            ->unique(fn (CompanyRemittance $item) => CompanyRemittanceSupport::alertDedupeKey($item))
            ->map(fn (CompanyRemittance $item) => CompanyRemittanceSupport::payload($item))
            ->values();

        return $this->success([
            'items' => $items,
            'count' => $items->count(),
        ], '匯款提醒查詢成功');
    }

    public function remind(CompanyRemittance $remittance): JsonResponse
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            return $this->error('此筆匯款已入帳', 422);
        }

        CompanyRemittanceSupport::dismissAlerts([$remittance->id]);

        return $this->success(
            CompanyRemittanceSupport::payload($remittance->fresh()),
            '已標記催繳，一週後若仍未入帳會再次提醒'
        );
    }

    public function dismissAlerts(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'remittance_ids' => ['required', 'array', 'min:1'],
            'remittance_ids.*' => ['integer', 'exists:company_remittances,id'],
        ]);

        CompanyRemittanceSupport::dismissAlerts($validated['remittance_ids']);

        return $this->success(null, '匯款提醒已暫停一週');
    }

    public function confirm(CompanyRemittance $remittance): JsonResponse
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            return $this->error('此筆匯款已入帳', 422);
        }

        $remittance->status = CompanyRemittance::STATUS_CONFIRMED;
        $remittance->confirmed_at = now();
        $remittance->save();

        FundRoutingService::onRemittanceConfirmed($remittance->fresh());

        return $this->success(
            CompanyRemittanceSupport::payload($remittance->fresh()),
            '已確認入帳'
        );
    }

    public function update(Request $request, CompanyRemittance $remittance): JsonResponse
    {
        $validated = $request->validate([
            'expected_remittance_date' => ['nullable', 'date'],
            'confirmed_at' => ['nullable', 'date'],
            'amount' => ['nullable', 'integer', 'min:1'],
        ]);

        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            if (array_key_exists('amount', $validated) || array_key_exists('expected_remittance_date', $validated)) {
                return $this->error('已入帳紀錄僅可修改實際入帳日期', 422);
            }
        }

        if (array_key_exists('expected_remittance_date', $validated)) {
            $remittance->expected_remittance_date = $validated['expected_remittance_date'];
        }

        if (array_key_exists('amount', $validated) && $validated['amount'] !== null) {
            $remittance->amount = (int) $validated['amount'];
        }

        if (array_key_exists('confirmed_at', $validated)) {
            $confirmedAt = $validated['confirmed_at']
                ? Carbon::parse($validated['confirmed_at'])->startOfDay()
                : null;

            $remittance->confirmed_at = $confirmedAt;

            if ($confirmedAt !== null) {
                $remittance->status = CompanyRemittance::STATUS_CONFIRMED;
            } elseif ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
                $remittance->status = CompanyRemittance::STATUS_PENDING;
            }
        }

        $remittance->save();

        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            FundRoutingService::onRemittanceConfirmed($remittance->fresh());
        }

        return $this->success(
            CompanyRemittanceSupport::payload($remittance->fresh()),
            '匯款紀錄已更新'
        );
    }

    public function split(Request $request, CompanyRemittance $remittance): JsonResponse
    {
        $validated = $request->validate([
            'split_amount' => ['required', 'integer', 'min:1'],
            'expected_remittance_date' => ['nullable', 'date'],
        ]);

        try {
            $result = CompanyRemittanceSupport::split(
                $remittance,
                (int) $validated['split_amount'],
                $validated['expected_remittance_date'] ?? null,
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success([
            'original' => CompanyRemittanceSupport::payload($result['original']),
            'split' => CompanyRemittanceSupport::payload($result['split']),
        ], '匯款紀錄已拆分');
    }
}
