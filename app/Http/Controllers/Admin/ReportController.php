<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Support\CompanyRemittanceSupport;
use App\Support\EmployeeReportSupport;
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
            $payload = EmployeeReportSupport::buildFromSchedule($report->dailySchedule, $input);
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        $report->fill(collect($payload)->only([
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
        ])->all());
        $report->save();
        CompanyRemittanceSupport::syncForReport($report->fresh());

        return $this->success(
            EmployeeReportSupport::reportPayload($report->fresh()),
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
