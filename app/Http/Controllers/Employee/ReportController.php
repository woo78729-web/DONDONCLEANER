<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Support\EmployeeMonthlySummary;
use App\Support\EmployeeReportSupport;
use App\Support\EmployeeScheduleSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => [
                'nullable',
                'date',
                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),
            ],
        ]);

        $dateFrom = $validated['date_from'] ?? now()->subDays(30)->toDateString();
        $dateTo = $validated['date_to'] ?? now()->toDateString();

        $reports = DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->select(
                    'id',
                    'user_id',
                    'work_date',
                    'start_time',
                    'end_time',
                    'customer_name',
                    'customer_address',
                    'ac_units',
                    'cleaning_price',
                    'task_details',
                    'pricing_lines',
                    'unit_price',
                    'needs_invoice',
                    'needs_mail',
                ),
            ])
            ->whereHas('dailySchedule', function ($query) use ($request, $dateFrom, $dateTo) {
                $query
                    ->where('user_id', $request->user()->id)
                    ->whereDate('work_date', '>=', $dateFrom)
                    ->whereDate('work_date', '<=', $dateTo);
            })
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (DailyReport $report) => EmployeeReportSupport::reportPayload($report));

        return $this->success([
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'reports' => $reports,
        ], '回報紀錄查詢成功');
    }

    public function summary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $yearMonth = $validated['year_month'] ?? now()->format('Y-m');

        return $this->success(
            EmployeeMonthlySummary::build((int) $request->user()->id, $yearMonth),
            '本月帳務查詢成功'
        );
    }

    public function pending(Request $request): JsonResponse
    {
        $workDate = $request->validate([
            'work_date' => ['nullable', 'date'],
        ])['work_date'] ?? now()->toDateString();

        $schedules = DailySchedule::query()
            ->with(EmployeeScheduleSupport::scheduleRelations())
            ->where('user_id', $request->user()->id)
            ->whereDate('work_date', $workDate)
            ->whereDoesntHave('dailyReport')
            ->orderBy('start_time')
            ->orderBy('id')
            ->get();

        $overdue = EmployeeScheduleSupport::overdueUnreportedSchedules($request->user()->id);
        $overdueIds = $overdue->pluck('id');

        $schedules = EmployeeScheduleSupport::annotateOverdueUnreported(
            EmployeeScheduleSupport::pinOverdueUnreported(
                $overdue->concat(
                    $schedules->reject(fn (DailySchedule $schedule) => $overdueIds->contains($schedule->id)),
                )->unique('id'),
            ),
        );

        return $this->success([
            'work_date' => $workDate,
            'schedules' => $schedules,
            'overdue_unreported_count' => EmployeeScheduleSupport::countOverdueUnreported($schedules),
        ], '待回報班表查詢成功');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id' => ['required', 'integer', 'exists:daily_schedules,id'],
            'completed_units' => ['required', 'integer', 'min:0'],
            'skip_reason' => ['nullable', 'string', 'max:500'],
            'has_tax' => ['sometimes', 'boolean'],
            'needs_invoice_and_mail' => ['sometimes', 'boolean'],
            'needs_receipt_and_mail' => ['sometimes', 'boolean'],
            'temporary_request' => ['nullable', 'string', 'max:1000'],
            'collected_amount' => ['sometimes', 'integer', 'min:0'],
            'paid_to_company' => ['sometimes', 'boolean'],
            'pricing_lines' => ['sometimes', 'array'],
            'pricing_lines.*.ac_units' => ['required_with:pricing_lines', 'integer', 'min:1'],
            'pricing_lines.*.unit_price' => ['required_with:pricing_lines', 'integer', 'in:1500,1300,1000'],
            'pricing_lines.*.is_taxable' => ['sometimes', 'boolean'],
        ]);

        $schedule = DailySchedule::query()
            ->where('id', $validated['schedule_id'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $schedule) {
            return $this->error('找不到對應班表或無權限回報', 404);
        }

        if ($schedule->dailyReport()->exists()) {
            return $this->error('此班表已有回報紀錄，如需調整請聯絡管理員', 400);
        }

        try {
            $report = EmployeeReportSupport::createFromSchedule($schedule, $validated);
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            EmployeeReportSupport::reportPayload($report->fresh()),
            $report->paid_to_company
                ? '回報提交成功，已列入匯款追查待確認入帳'
                : '回報提交成功，送出後無法自行修改',
            201
        );
    }
}
