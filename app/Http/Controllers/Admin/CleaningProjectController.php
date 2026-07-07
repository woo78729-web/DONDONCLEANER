<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CleaningProject;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\CleaningProjectSupport;
use App\Support\CustomerSource;
use App\Support\ScheduleMutationPolicy;
use App\Support\SchedulePricing;
use App\Support\TaitungServiceArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CleaningProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(CleaningProjectSupport::allowedStatuses())],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = CleaningProject::query()
            ->with(['employees:id,name,account'])
            ->when(! empty($validated['status']), fn ($builder) => $builder->where('status', $validated['status']))
            ->orderByDesc('planned_start_date')
            ->orderByDesc('id');

        $perPage = $validated['per_page'] ?? 20;
        $projects = $query->paginate(
            $perPage,
            ['*'],
            'page',
            $validated['page'] ?? 1,
        );

        return $this->success([
            'projects' => collect($projects->items())->map(
                fn (CleaningProject $project) => CleaningProjectSupport::payload($project)
            )->values(),
            'status_labels' => CleaningProjectSupport::statusLabels(),
            'pagination' => [
                'current_page' => $projects->currentPage(),
                'per_page' => $projects->perPage(),
                'total' => $projects->total(),
                'last_page' => $projects->lastPage(),
            ],
        ], '專案列表查詢成功');
    }

    public function show(CleaningProject $project): JsonResponse
    {
        $project->load(['schedules.user', 'schedules.dailyReport', 'employees']);

        return $this->success(
            CleaningProjectSupport::payload($project, detailed: true),
            '專案查詢成功'
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->projectRules());

        if ($error = $this->validateEmployees($validated['employee_ids'])) {
            return $error;
        }

        if ($error = $this->validateProjectDates($request, $validated['planned_start_date'], $validated['planned_end_date'])) {
            return $error;
        }

        try {
            $project = CleaningProjectSupport::createProject(
                $validated,
                $validated['employee_ids'],
                $request->user(),
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            CleaningProjectSupport::payload($project, detailed: true),
            '專案建立成功',
            201
        );
    }

    public function updateStatus(Request $request, CleaningProject $project): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(CleaningProjectSupport::allowedStatuses())],
        ]);

        $project->status = $validated['status'];

        if ($validated['status'] === CleaningProject::STATUS_CLOSED) {
            $project->completed_at = now();
        } elseif ($validated['status'] === CleaningProject::STATUS_IN_PROGRESS) {
            $project->completed_at = null;
        }

        $project->save();

        return $this->success(
            CleaningProjectSupport::payload($project->fresh(['employees']), detailed: true),
            '專案狀態已更新'
        );
    }

    public function updateUnits(Request $request, CleaningProject $project): JsonResponse
    {
        $validated = $request->validate([
            'total_ac_units' => ['required', 'integer', 'min:1', 'max:9999'],
            'pricing_lines' => ['nullable', 'array', 'min:1', 'max:10'],
            'pricing_lines.*.ac_units' => ['required_with:pricing_lines', 'integer', 'min:1', 'max:9999'],
            'pricing_lines.*.unit_price' => ['required_with:pricing_lines', 'integer', Rule::in(SchedulePricing::unitPrices())],
            'pricing_lines.*.is_taxable' => ['nullable', 'boolean'],
            'pricing_lines.*.invoice_type' => ['nullable', 'string', Rule::in([
                SchedulePricing::INVOICE_TYPE_NONE,
                SchedulePricing::INVOICE_TYPE_DUPLICATE,
                SchedulePricing::INVOICE_TYPE_TRIPLICATE,
            ])],
            'pricing_lines.*.invoice_title' => ['nullable', 'string', 'max:255'],
            'pricing_lines.*.invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'pricing_lines.*.charge_customer_tax' => ['nullable', 'boolean'],
        ]);

        try {
            $project = CleaningProjectSupport::updateProjectUnits(
                $project,
                (int) $validated['total_ac_units'],
                $validated['pricing_lines'] ?? null,
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            CleaningProjectSupport::payload($project, detailed: true),
            '專案台數已更新'
        );
    }

    public function updateScheduleUnits(Request $request, CleaningProject $project, DailySchedule $schedule): JsonResponse
    {
        if ($schedule->schedule_kind === CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK) {
            return $this->error('行事曆占位班表不可調整台數', 422);
        }

        $validated = $request->validate([
            'ac_units' => ['required', 'integer', 'min:1', 'max:9999'],
            'unit_price' => ['nullable', 'integer', Rule::in(SchedulePricing::unitPrices())],
        ]);

        $pricingLines = null;

        if (array_key_exists('unit_price', $validated) && $validated['unit_price'] !== null) {
            $pricingLines = [[
                'ac_units' => (int) $validated['ac_units'],
                'unit_price' => (int) $validated['unit_price'],
            ]];
        }

        try {
            $project = CleaningProjectSupport::updateScheduleUnits(
                $project,
                $schedule,
                (int) $validated['ac_units'],
                $pricingLines,
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            CleaningProjectSupport::payload($project, detailed: true),
            '師傅派班台數已更新'
        );
    }

    public function updateAssignments(Request $request, CleaningProject $project): JsonResponse
    {
        $validated = $request->validate([
            'assignments' => ['required', 'array', 'min:1'],
            'assignments.*.user_id' => ['required', 'integer', 'exists:users,id'],
            'assignments.*.assigned_units' => ['required', 'integer', 'min:0'],
        ]);

        try {
            $project = CleaningProjectSupport::updateEmployeeAssignments(
                $project,
                $validated['assignments'],
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            CleaningProjectSupport::payload($project, detailed: true),
            '師傅分台已更新'
        );
    }

    public function consolidateSettlement(CleaningProject $project): JsonResponse
    {
        try {
            CleaningProjectSupport::consolidateProjectSettlement($project);
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success(
            CleaningProjectSupport::payload($project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']), detailed: true),
            '專案已整理為整張工單分台'
        );
    }

    public function destroy(CleaningProject $project): JsonResponse
    {
        CleaningProjectSupport::deleteProject($project);

        return $this->success(null, '專案已刪除');
    }

    public function storeSupplement(Request $request, CleaningProject $project): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'work_date' => ['required', 'date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'pricing_lines' => ['required', 'array', 'min:1', 'max:10'],
            'pricing_lines.*.ac_units' => ['required', 'integer', 'min:1', 'max:9999'],
            'pricing_lines.*.unit_price' => ['required', 'integer', Rule::in(SchedulePricing::unitPrices())],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        if ($error = $this->validateEmployees([(int) $validated['user_id']])) {
            return $error;
        }

        if ($error = $this->validateProjectDates($request, $validated['work_date'], $validated['work_date'])) {
            return $error;
        }

        $schedule = CleaningProjectSupport::addSupplementSchedule($project, $validated);

        return $this->success([
            'project' => CleaningProjectSupport::payload($project->fresh(['employees', 'schedules.dailyReport']), detailed: true),
            'schedule' => CleaningProjectSupport::schedulePayload($schedule),
        ], '補台數派班成功', 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function projectRules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:255'],
            'employee_ids' => ['required', 'array', 'min:1', 'max:10'],
            'employee_ids.*' => ['integer', 'exists:users,id'],
            'planned_start_date' => ['required', 'date'],
            'planned_end_date' => ['required', 'date', 'after_or_equal:planned_start_date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['required', 'string', 'max:50'],
            'customer_address' => ['required', 'string', 'max:255'],
            'mail_recipient' => ['nullable', 'string', 'max:255'],
            'mail_phone' => ['nullable', 'string', 'max:50'],
            'mail_address' => ['nullable', 'string', 'max:255'],
            'needs_mail' => ['nullable', 'boolean'],
            'service_area' => ['nullable', 'string', Rule::in(TaitungServiceArea::values())],
            'customer_source' => ['required', 'string', Rule::in(CustomerSource::values())],
            'fb_display_name' => ['nullable', 'string', 'max:255'],
            'line_display_name' => ['nullable', 'string', 'max:255'],
            'pricing_lines' => ['required', 'array', 'min:1', 'max:10'],
            'pricing_lines.*.ac_units' => ['required', 'integer', 'min:1', 'max:9999'],
            'pricing_lines.*.unit_price' => ['required', 'integer', Rule::in(SchedulePricing::unitPrices())],
            'pricing_lines.*.is_taxable' => ['nullable', 'boolean'],
            'pricing_lines.*.invoice_type' => ['nullable', 'string', Rule::in([
                SchedulePricing::INVOICE_TYPE_NONE,
                SchedulePricing::INVOICE_TYPE_DUPLICATE,
                SchedulePricing::INVOICE_TYPE_TRIPLICATE,
            ])],
            'pricing_lines.*.invoice_title' => ['nullable', 'string', 'max:255'],
            'pricing_lines.*.invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'pricing_lines.*.charge_customer_tax' => ['nullable', 'boolean'],
            'needs_invoice' => ['nullable', 'boolean'],
            'needs_receipt' => ['nullable', 'boolean'],
            'expects_company_remittance' => ['nullable', 'boolean'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @param  list<int>  $employeeIds
     */
    private function validateEmployees(array $employeeIds): ?JsonResponse
    {
        $activeEmployees = User::query()
            ->whereIn('id', $employeeIds)
            ->where('role', 'employee')
            ->where('is_active', true)
            ->count();

        if ($activeEmployees !== count(array_unique($employeeIds))) {
            return $this->error('請選擇有效的清洗師傅', 422);
        }

        return null;
    }

    private function validateProjectDates(Request $request, string $startDate, string $endDate): ?JsonResponse
    {
        foreach ([$startDate, $endDate] as $date) {
            if ($message = ScheduleMutationPolicy::canMutateSchedule($request->user(), $date)) {
                return $this->error($message, 422);
            }
        }

        return null;
    }
}
