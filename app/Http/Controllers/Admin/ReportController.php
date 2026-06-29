<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Support\ReportFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
            'reports' => $reports->items(),
            'pagination' => [
                'current_page' => $reports->currentPage(),
                'per_page' => $reports->perPage(),
                'total' => $reports->total(),
                'last_page' => $reports->lastPage(),
            ],
        ], '回報資料查詢成功');
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
