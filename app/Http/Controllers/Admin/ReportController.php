<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Support\CompanyRemittanceSupport;
use App\Support\EmployeeReportSupport;
use App\Support\ReportFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = ReportFilter::validate($request);
        $query = ReportFilter::apply($validated);
        $summary = ReportFilter::summarize($query);

        $perPage = $validated['per_page'] ?? 15;
        $reports = $query->paginate(
            $perPage,
            ['*'],
            'page',
            $validated['page'] ?? 1
        );

        return $this->success([
            'summary' => $summary,
            'filters' => ReportFilter::activeFilters($validated),
            'reports' => collect($reports->items())
                ->map(fn (DailyReport $report) => EmployeeReportSupport::reportPayload($report))
                ->values()
                ->all(),
            'pagination' => [
                'current_page' => $reports->currentPage(),
                'per_page' => $reports->perPage(),
                'total' => $reports->total(),
                'last_page' => $reports->lastPage(),
            ],
        ], '回報資料查詢成功');
    }

    public function unitChangeAlerts(Request $request): JsonResponse
    {
        try {
            if (! Schema::hasColumn('daily_reports', 'admin_unit_alert_dismissed_at')) {
                Log::warning('unit-change-alerts skipped: admin_unit_alert_dismissed_at column missing');

                return $this->success(['items' => []], '台數異動通知查詢成功');
            }

            $reports = DailyReport::query()
                ->with(['dailySchedule.user:id,name'])
                ->where('unit_mismatch', true)
                ->whereNull('admin_unit_alert_dismissed_at')
                ->orderByDesc('created_at')
                ->limit(20)
                ->get()
                ->map(function (DailyReport $report) {
                    $schedule = $report->dailySchedule;

                    return [
                        'id' => $report->id,
                        'work_date' => $schedule?->work_date?->toDateString(),
                        'employee_name' => $schedule?->user?->name,
                        'customer_name' => $schedule?->customer_name,
                        'customer_address' => $schedule?->customer_address,
                        'planned_units' => $report->planned_units,
                        'completed_units' => $report->completed_units,
                        'skip_reason' => $report->skip_reason,
                        'created_at' => $report->created_at?->toDateTimeString(),
                    ];
                })
                ->values()
                ->all();

            return $this->success(['items' => $reports], '台數異動通知查詢成功');
        } catch (\Throwable $exception) {
            Log::error('unit-change-alerts failed', [
                'message' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);

            return $this->error('台數異動通知查詢失敗，請確認資料庫 migration 已執行', 500);
        }
    }

    public function dismissUnitChangeAlerts(Request $request): JsonResponse
    {
        if (! Schema::hasColumn('daily_reports', 'admin_unit_alert_dismissed_at')) {
            Log::warning('dismiss unit-change-alerts skipped: admin_unit_alert_dismissed_at column missing');

            return $this->success(null, '台數異動通知已標記為已讀');
        }

        $validated = $request->validate([
            'report_ids' => ['required', 'array', 'min:1'],
            'report_ids.*' => ['integer', 'exists:daily_reports,id'],
        ]);

        try {
            DailyReport::query()
                ->whereIn('id', $validated['report_ids'])
                ->where('unit_mismatch', true)
                ->whereNull('admin_unit_alert_dismissed_at')
                ->update(['admin_unit_alert_dismissed_at' => now()]);

            return $this->success(null, '台數異動通知已標記為已讀');
        } catch (\Throwable $exception) {
            Log::error('dismiss unit-change-alerts failed', [
                'message' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);

            return $this->error('台數異動通知更新失敗', 500);
        }
    }

    public function update(Request $request, DailyReport $report): JsonResponse
    {
        $report->loadMissing('dailySchedule');

        if (! $report->dailySchedule) {
            return $this->error('找不到對應班表', 404);
        }

        $validated = $request->validate([
            'completed_units' => ['sometimes', 'integer', 'min:0'],
            'skip_reason' => ['sometimes', 'nullable', 'string', 'max:500'],
            'has_tax' => ['sometimes', 'boolean'],
            'needs_invoice_and_mail' => ['sometimes', 'boolean'],
            'needs_receipt_and_mail' => ['sometimes', 'boolean'],
            'temporary_request' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'collected_amount' => ['sometimes', 'integer', 'min:0'],
            'paid_to_company' => ['sometimes', 'boolean'],
            'travel_allowance' => ['sometimes', 'integer', 'min:0'],
        ]);

        $input = array_merge([
            'completed_units' => $report->completed_units,
            'skip_reason' => $report->skip_reason,
            'has_tax' => $report->has_tax,
            'needs_invoice_and_mail' => $report->needs_invoice_and_mail,
            'needs_receipt_and_mail' => $report->needs_receipt_and_mail,
            'temporary_request' => $report->temporary_request,
            'collected_amount' => $report->collected_amount,
            'paid_to_company' => $report->paid_to_company,
            'travel_allowance' => $report->travel_allowance,
        ], $validated);

        try {
            $requireSkipReason = ! in_array($request->user()->role, ['admin', 'customer_service'], true);
            $payload = EmployeeReportSupport::buildFromSchedule(
                $report->dailySchedule,
                $input,
                $report,
                $requireSkipReason,
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        $report = EmployeeReportSupport::applyPayload($report, $payload);

        return $this->success(
            EmployeeReportSupport::reportPayload($report),
            '回報資料已更新'
        );
    }

    public function export(Request $request): StreamedResponse
    {
        $validated = ReportFilter::validate($request, includePagination: false);
        $reports = ReportFilter::apply($validated)->get();

        $filename = 'daily-reports-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($reports) {
            $handle = fopen('php://output', 'w');

            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                '回報ID',
                '工作日期',
                '員工姓名',
                '員工帳號',
                '客戶地址',
                '客戶電話',
                '機型備註',
                '清洗台數',
                '收取金額',
                '回報時間',
            ]);

            foreach ($reports as $report) {
                $schedule = $report->dailySchedule;
                $user = $schedule?->user;

                fputcsv($handle, [
                    $report->id,
                    $schedule?->work_date?->toDateString(),
                    $user?->name,
                    $user?->account,
                    $schedule?->customer_address,
                    $schedule?->customer_phone,
                    $schedule?->task_details,
                    $report->completed_units,
                    $report->collected_amount,
                    $report->created_at?->toDateTimeString(),
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
