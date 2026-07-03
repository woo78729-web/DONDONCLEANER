<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Support\CompanyRemittanceSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $pending = CompanyRemittance::query()
            ->with(['report.dailySchedule.user:id,name,account'])
            ->whereIn('status', [CompanyRemittance::STATUS_PENDING, CompanyRemittance::STATUS_REMINDED])
            ->whereHas('report.dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', (int) $year)
                    ->whereMonth('work_date', (int) $month);
            })
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->map(fn (CompanyRemittance $item) => CompanyRemittanceSupport::payload($item))
            ->values();

        $confirmed = CompanyRemittance::query()
            ->with(['report.dailySchedule.user:id,name,account'])
            ->where('status', CompanyRemittance::STATUS_CONFIRMED)
            ->whereHas('report.dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', (int) $year)
                    ->whereMonth('work_date', (int) $month);
            })
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

        $remittance->status = CompanyRemittance::STATUS_REMINDED;
        $remittance->reminded_at = now();
        $remittance->save();

        return $this->success(
            CompanyRemittanceSupport::payload($remittance->fresh()),
            '已標記催繳，一週後若仍未入帳會再次提醒'
        );
    }

    public function confirm(CompanyRemittance $remittance): JsonResponse
    {
        if ($remittance->status === CompanyRemittance::STATUS_CONFIRMED) {
            return $this->error('此筆匯款已入帳', 422);
        }

        $remittance->status = CompanyRemittance::STATUS_CONFIRMED;
        $remittance->confirmed_at = now();
        $remittance->save();

        return $this->success(
            CompanyRemittanceSupport::payload($remittance->fresh()),
            '已確認入帳，金額已列入宏逸帳戶'
        );
    }
}
