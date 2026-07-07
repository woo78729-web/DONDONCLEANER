<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\CustomerSource;
use App\Support\ScheduleBackfillSupport;
use App\Support\ScheduleCustomerServicePolicy;
use App\Support\ScheduleDeletionSupport;
use App\Support\ScheduleMutationPolicy;
use App\Support\SchedulePricing;
use App\Support\MailTrackingSupport;
use App\Support\EmployeeReportSupport;
use App\Support\TaitungServiceArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'view' => ['nullable', 'in:calendar,list'],
            'date_from' => ['nullable', 'date'],
            'date_to' => [
                'nullable',
                'date',
                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),
            ],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'has_report' => ['nullable', 'boolean'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'service_areas' => ['nullable', 'string', 'max:500'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->scheduleQuery($validated);

        if (($validated['view'] ?? 'list') === 'calendar') {
            $schedules = $query
                ->orderBy('work_date')
                ->orderBy('start_time')
                ->orderBy('id')
                ->get();

            return $this->success([
                'filters' => $this->filterPayload($validated),
                'schedules' => $schedules,
            ], '班表行事曆查詢成功');
        }

        $perPage = $validated['per_page'] ?? 15;
        $schedules = $query
            ->orderByDesc('work_date')
            ->orderByDesc('start_time')
            ->orderByDesc('id')
            ->paginate(
                $perPage,
                ['*'],
                'page',
                $validated['page'] ?? 1
            );

        return $this->success([
            'filters' => $this->filterPayload($validated),
            'schedules' => $schedules->items(),
            'pagination' => [
                'current_page' => $schedules->currentPage(),
                'per_page' => $schedules->perPage(),
                'total' => $schedules->total(),
                'last_page' => $schedules->lastPage(),
            ],
        ], '班表列表查詢成功');
    }

    public function show(DailySchedule $schedule): JsonResponse
    {
        return $this->success(
            $schedule->load([
                'user:id,name,account,role,is_active,avatar_path',
                'dailyReport:id,schedule_id,completed_units,collected_amount,paid_to_company',
            ]),
            '班表查詢成功'
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->scheduleRules());

        if ($error = $this->validateEmployee($validated['user_id'])) {
            return $error;
        }

        if ($error = $this->validateTimeRange($validated['start_time'], $validated['end_time'])) {
            return $error;
        }

        if ($error = $this->validateScheduleTime($validated['start_time'])) {
            return $error;
        }

        if ($error = $this->validateScheduleTime($validated['end_time'])) {
            return $error;
        }

        if ($error = $this->validateScheduleMutationAccess($request, $validated['work_date'])) {
            return $error;
        }

        if ($error = $this->validateScheduleTimingRules($validated['work_date'], $validated['start_time'])) {
            return $error;
        }

        $validated = ScheduleCustomerServicePolicy::preparePayload($validated, $request->user());
        $validated = $this->normalizeSchedulePayload($validated);
        $validated = ScheduleCustomerServicePolicy::finalizePayload($validated, $request->user());

        $schedule = DailySchedule::query()->create($validated);
        ScheduleBackfillSupport::createReportIfPastBackfill($schedule);

        return $this->success(
            $schedule->fresh()->load([
                'user:id,name,account,role,is_active,avatar_path',
                'dailyReport:id,schedule_id,completed_units,collected_amount,paid_to_company',
            ]),
            '班表建立成功',
            201
        );
    }

    public function update(Request $request, DailySchedule $schedule): JsonResponse
    {
        $hasReport = $schedule->dailyReport()->exists();

        if ($hasReport && ! ScheduleMutationPolicy::canForceMutateReportedSchedule($request->user())) {
            return $this->error('此班表已有回報紀錄，無法編輯', 400);
        }

        $validated = $request->validate($this->scheduleRules(sometimes: true));

        if (isset($validated['user_id']) && ($error = $this->validateEmployee($validated['user_id'], $schedule->user_id))) {
            return $error;
        }

        $startTime = $validated['start_time'] ?? $this->formatTime($schedule->start_time);
        $endTime = $validated['end_time'] ?? $this->formatTime($schedule->end_time);

        if ($error = $this->validateTimeRange($startTime, $endTime)) {
            return $error;
        }

        if ($error = $this->validateScheduleTime($startTime)) {
            return $error;
        }

        if ($error = $this->validateScheduleTime($endTime)) {
            return $error;
        }

        $payload = array_merge([
            'user_id' => $schedule->user_id,
            'work_date' => $schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date,
            'start_time' => $this->formatTime($schedule->start_time),
            'end_time' => $this->formatTime($schedule->end_time),
            'customer_name' => $schedule->customer_name,
            'customer_phone' => $schedule->customer_phone,
            'customer_address' => $schedule->customer_address,
            'mail_recipient' => $schedule->mail_recipient,
            'mail_phone' => $schedule->mail_phone,
            'mail_address' => $schedule->mail_address,
            'needs_mail' => $schedule->needs_mail,
            'service_area' => $schedule->service_area,
            'customer_source' => $schedule->customer_source,
            'fb_display_name' => $schedule->fb_display_name,
            'line_display_name' => $schedule->line_display_name,
            'pricing_lines' => $schedule->pricing_lines,
            'ac_units' => $schedule->ac_units,
            'cleaning_price' => $schedule->cleaning_price,
            'unit_price' => $schedule->unit_price,
            'needs_invoice' => $schedule->needs_invoice,
            'needs_receipt' => $schedule->needs_receipt,
            'invoice_charge_customer_tax' => $schedule->invoice_charge_customer_tax,
            'invoice_planned_date' => $schedule->invoice_planned_date?->format('Y-m-d'),
            'invoice_tax_id' => $schedule->invoice_tax_id,
            'invoice_title' => $schedule->invoice_title,
            'notes' => $schedule->notes,
        ], $validated);

        $payload = ScheduleCustomerServicePolicy::preparePayload($payload, $request->user(), $schedule);
        $validated = $this->normalizeSchedulePayload($payload);
        $validated = ScheduleCustomerServicePolicy::finalizePayload($validated, $request->user(), $schedule);

        if ($error = $this->validateScheduleMutationAccess($request, $validated['work_date'], $schedule)) {
            return $error;
        }

        if ($error = $this->validateScheduleTimingRules(
            $validated['work_date'],
            $validated['start_time'],
            $schedule
        )) {
            return $error;
        }

        $oldPlannedUnits = (int) $schedule->ac_units;
        $schedule->fill($validated);
        $schedule->save();

        if ($hasReport) {
            $report = $schedule->dailyReport()->first();
            $overrides = [];
            $newPlannedUnits = (int) $schedule->ac_units;

            if ((int) $report->completed_units === $oldPlannedUnits
                || (int) $report->completed_units > $newPlannedUnits) {
                $overrides['completed_units'] = $newPlannedUnits;
            }

            EmployeeReportSupport::resyncFromSchedule(
                $report,
                $overrides,
                recalculateCollectedAmount: true,
            );
        }

        return $this->success(
            $schedule->fresh()->load([
                'user:id,name,account,role,is_active,avatar_path',
                'dailyReport:id,schedule_id,completed_units,collected_amount,paid_to_company',
            ]),
            '班表更新成功'
        );
    }

    public function destroy(Request $request, DailySchedule $schedule): JsonResponse
    {
        $hasReport = $schedule->dailyReport()->exists();

        if ($hasReport && ! ScheduleMutationPolicy::canForceMutateReportedSchedule($request->user())) {
            return $this->error('此班表已有回報紀錄，無法刪除', 400);
        }

        $workDate = $schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date;

        if ($error = $this->validateScheduleMutationAccess($request, $workDate, $schedule)) {
            return $error;
        }

        ScheduleDeletionSupport::deleteWithDependents($schedule);

        return $this->success(null, $hasReport ? '班表與相關回報、匯款紀錄已刪除' : '班表刪除成功');
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function scheduleQuery(array $validated)
    {
        return DailySchedule::query()
            ->with([
                'user:id,name,account,role,is_active,avatar_path',
                'dailyReport:id,schedule_id,completed_units,collected_amount,paid_to_company',
                'cleaningProject:id,project_code,title,status,planned_start_date,planned_end_date,total_ac_units',
            ])
            ->when(! empty($validated['date_from']), function ($builder) use ($validated) {
                $builder->whereDate('work_date', '>=', $validated['date_from']);
            })
            ->when(! empty($validated['date_to']), function ($builder) use ($validated) {
                $builder->whereDate('work_date', '<=', $validated['date_to']);
            })
            ->when(! empty($validated['user_id']), function ($builder) use ($validated) {
                $builder->where('user_id', $validated['user_id']);
            })
            ->when(array_key_exists('has_report', $validated), function ($builder) use ($validated) {
                if ($validated['has_report']) {
                    $builder->whereHas('dailyReport');
                } else {
                    $builder->whereDoesntHave('dailyReport');
                }
            })
            ->when(! empty($validated['customer_phone']), function ($builder) use ($validated) {
                $phone = preg_replace('/\s+/', '', $validated['customer_phone']);
                $builder->where('customer_phone', 'like', '%'.$phone.'%');
            })
            ->when(! empty($validated['service_areas']), function ($builder) use ($validated) {
                $areas = array_values(array_filter(array_map('trim', explode(',', $validated['service_areas']))));
                $allowed = array_values(array_intersect($areas, TaitungServiceArea::values()));

                if ($allowed !== []) {
                    $builder->whereIn('service_area', $allowed);
                }
            });
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function filterPayload(array $validated): array
    {
        return array_filter([
            'view' => $validated['view'] ?? null,
            'date_from' => $validated['date_from'] ?? null,
            'date_to' => $validated['date_to'] ?? null,
            'user_id' => $validated['user_id'] ?? null,
            'has_report' => array_key_exists('has_report', $validated) ? $validated['has_report'] : null,
            'customer_phone' => $validated['customer_phone'] ?? null,
            'service_areas' => $validated['service_areas'] ?? null,
        ], fn ($value) => $value !== null);
    }

    /**
     * @return array<string, mixed>
     */
    private function scheduleRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'user_id' => [$required, 'integer', 'exists:users,id'],
            'work_date' => [$required, 'date'],
            'start_time' => [$required, 'date_format:H:i'],
            'end_time' => [$required, 'date_format:H:i'],
            'customer_name' => [$required, 'string', 'max:255'],
            'customer_phone' => [$required, 'string', 'max:50'],
            'customer_address' => [$required, 'string', 'max:255'],
            'mail_recipient' => ['nullable', 'string', 'max:255'],
            'mail_phone' => ['nullable', 'string', 'max:50'],
            'mail_address' => ['nullable', 'string', 'max:255'],
            'needs_mail' => ['nullable', 'boolean'],
            'service_area' => ['nullable', 'string', Rule::in(TaitungServiceArea::values())],
            'customer_source' => [$required, 'string', Rule::in(CustomerSource::values())],
            'fb_display_name' => ['nullable', 'string', 'max:255'],
            'line_display_name' => ['nullable', 'string', 'max:255'],
            'pricing_lines' => [$required, 'array', 'min:1', 'max:10'],
            'pricing_lines.*.ac_units' => ['required', 'integer', 'min:1', 'max:99'],
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
            'hongyi_fee' => ['nullable', 'integer', 'min:0'],
            'multi_address_part' => ['nullable', 'array'],
            'multi_address_part.index' => ['nullable', 'integer', 'min:1'],
            'multi_address_part.total' => ['nullable', 'integer', 'min:2'],
            'multi_address_part.segment_units' => ['nullable', 'integer', 'min:1'],
            'multi_address_part.group_units' => ['nullable', 'integer', 'min:1'],
            'multi_address_part.group_price' => ['nullable', 'integer', 'min:0'],
            'needs_invoice' => ['nullable', 'boolean'],
            'needs_receipt' => ['nullable', 'boolean'],
            'invoice_charge_customer_tax' => ['nullable', 'boolean'],
            'invoice_planned_date' => ['nullable', 'date'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizeSchedulePayload(array $payload): array
    {
        $needsReceipt = (bool) ($payload['needs_receipt'] ?? false);
        $lines = SchedulePricing::normalizeLines(
            $payload['pricing_lines'] ?? null,
            isset($payload['ac_units']) ? (int) $payload['ac_units'] : null,
            isset($payload['unit_price']) ? (int) $payload['unit_price'] : null,
        );
        $multiAddressPart = is_array($payload['multi_address_part'] ?? null)
            ? $payload['multi_address_part']
            : null;
        $needsInvoice = (bool) ($payload['needs_invoice'] ?? false)
            || collect($lines)->contains(fn (array $line): bool => SchedulePricing::lineHasInvoice($line));
        $summary = SchedulePricing::summarizeLines($lines, $needsInvoice);
        $triplicateLine = collect($lines)->first(
            fn (array $line): bool => ($line['invoice_type'] ?? '') === SchedulePricing::INVOICE_TYPE_TRIPLICATE
        );
        $chargeCustomerTax = collect($lines)->contains(
            fn (array $line): bool => SchedulePricing::lineHasInvoice($line) && ($line['charge_customer_tax'] ?? true)
        ) || (bool) ($payload['invoice_charge_customer_tax'] ?? false);

        if ($multiAddressPart) {
            $partIndex = max(1, (int) ($multiAddressPart['index'] ?? 1));
            $segmentUnits = max(1, (int) ($multiAddressPart['segment_units'] ?? ($lines[0]['ac_units'] ?? 1)));
            $groupUnits = max($segmentUnits, (int) ($multiAddressPart['group_units'] ?? $segmentUnits));
            $groupPrice = max(0, (int) ($multiAddressPart['group_price'] ?? 0));
            $primaryLine = $lines[0] ?? SchedulePricing::normalizeLines(null)[0];

            if ($partIndex === 1) {
                $lines = [[
                    'ac_units' => $segmentUnits,
                    'unit_price' => (int) ($primaryLine['unit_price'] ?? 1500),
                    'is_taxable' => (bool) ($primaryLine['is_taxable'] ?? false),
                    'invoice_type' => $primaryLine['invoice_type'] ?? SchedulePricing::INVOICE_TYPE_NONE,
                    'invoice_title' => $primaryLine['invoice_title'] ?? null,
                    'invoice_tax_id' => $primaryLine['invoice_tax_id'] ?? null,
                    'charge_customer_tax' => (bool) ($primaryLine['charge_customer_tax'] ?? false),
                ]];
                $summary = [
                    'ac_units' => $segmentUnits,
                    'unit_price' => (int) ($primaryLine['unit_price'] ?? 1500),
                    'cleaning_price' => $groupPrice,
                    'hongyi_fee' => (int) ($payload['hongyi_fee'] ?? $summary['hongyi_fee'] ?? 0),
                    'needs_invoice' => $needsInvoice,
                    'task_details' => $segmentUnits.'台'.($primaryLine['unit_price'] ?? 1500).'·共'.$groupUnits.'台'.$groupPrice,
                ];
            } else {
                $segmentSummary = SchedulePricing::summarizeLines($lines, $needsInvoice);
                $summary = [
                    'ac_units' => $segmentUnits,
                    'unit_price' => (int) ($lines[0]['unit_price'] ?? 1500),
                    'cleaning_price' => 0,
                    'hongyi_fee' => 0,
                    'needs_invoice' => false,
                    'task_details' => $segmentSummary['task_details'],
                ];
                $payload['needs_mail'] = false;
                $payload['needs_invoice'] = false;
                $payload['needs_receipt'] = false;
                $payload['invoice_charge_customer_tax'] = false;
                $payload['invoice_planned_date'] = null;
                $payload['hongyi_fee'] = 0;
            }
        }

        $payload['pricing_lines'] = $lines;
        $payload['ac_units'] = $summary['ac_units'];
        $payload['unit_price'] = $summary['unit_price'];
        $payload['needs_invoice'] = $needsInvoice && (! $multiAddressPart || (int) ($multiAddressPart['index'] ?? 1) === 1);
        $payload['needs_receipt'] = $needsReceipt && (! $multiAddressPart || (int) ($multiAddressPart['index'] ?? 1) === 1);
        $payload['invoice_charge_customer_tax'] = $needsInvoice && $chargeCustomerTax;
        $payload['invoice_planned_date'] = isset($payload['invoice_planned_date']) && $payload['invoice_planned_date'] !== ''
            ? $payload['invoice_planned_date']
            : null;
        $payload['cleaning_price'] = $summary['cleaning_price'];
        $payload['hongyi_fee'] = (int) ($summary['hongyi_fee'] ?? 0);
        $payload['task_details'] = $summary['task_details'];
        unset($payload['multi_address_part']);
        $needsMail = (bool) ($payload['needs_mail'] ?? false);
        $payload['needs_mail'] = $needsMail;

        if ($needsMail) {
            $payload['mail_recipient'] = isset($payload['mail_recipient']) && $payload['mail_recipient'] !== ''
                ? trim((string) $payload['mail_recipient'])
                : null;
            $payload['mail_phone'] = isset($payload['mail_phone']) && $payload['mail_phone'] !== ''
                ? trim((string) $payload['mail_phone'])
                : null;
            $payload['mail_address'] = isset($payload['mail_address']) && $payload['mail_address'] !== ''
                ? trim((string) $payload['mail_address'])
                : null;
        } else {
            $payload['mail_recipient'] = null;
            $payload['mail_phone'] = null;
            $payload['mail_address'] = null;
        }

        if ($multiAddressPart && (int) ($multiAddressPart['index'] ?? 0) > 1) {
            $payload['invoice_tax_id'] = null;
            $payload['invoice_title'] = null;
        } elseif ($payload['needs_invoice']) {
            if ($triplicateLine) {
                $payload['invoice_tax_id'] = trim((string) ($triplicateLine['invoice_tax_id'] ?? '')) ?: null;
                $payload['invoice_title'] = trim((string) ($triplicateLine['invoice_title'] ?? '')) ?: null;
            } else {
                $payload['invoice_tax_id'] = isset($payload['invoice_tax_id']) && $payload['invoice_tax_id'] !== ''
                    ? trim((string) $payload['invoice_tax_id'])
                    : null;
                $payload['invoice_title'] = isset($payload['invoice_title']) && $payload['invoice_title'] !== ''
                    ? trim((string) $payload['invoice_title'])
                    : null;
            }
        } else {
            $payload['invoice_tax_id'] = null;
            $payload['invoice_title'] = null;
            $payload['invoice_charge_customer_tax'] = false;
        }

        if ($payload['needs_receipt']) {
            $payload['invoice_tax_id'] = null;
            $payload['invoice_title'] = null;
            $payload['needs_invoice'] = false;
            $payload['invoice_charge_customer_tax'] = false;
        }

        $payload['service_area'] = $payload['service_area'] ?? null;
        $payload['fb_display_name'] = isset($payload['fb_display_name']) && $payload['fb_display_name'] !== ''
            ? trim((string) $payload['fb_display_name'])
            : null;
        $payload['line_display_name'] = isset($payload['line_display_name']) && $payload['line_display_name'] !== ''
            ? trim((string) $payload['line_display_name'])
            : null;

        return MailTrackingSupport::enforceStorageRules($payload);
    }

    private function validateScheduleTime(string $time): ?JsonResponse
    {
        if (! preg_match('/^\d{2}:(00|30)$/', $time)) {
            return $this->error('預約時間僅能選擇整點或 30 分', 422);
        }

        return null;
    }

    private function validateEmployee(int $userId, ?int $currentUserId = null): ?JsonResponse
    {
        if ($currentUserId !== null && $userId === $currentUserId) {
            return null;
        }

        $employee = User::query()
            ->where('id', $userId)
            ->where('role', 'employee')
            ->where('is_active', true)
            ->first();

        if (! $employee) {
            return $this->error('指定的使用者不是有效員工', 422);
        }

        return null;
    }

    private function validateTimeRange(string $startTime, string $endTime): ?JsonResponse
    {
        if (strtotime($endTime) <= strtotime($startTime)) {
            return $this->error('結束時間必須晚於開始時間', 422);
        }

        return null;
    }

    private function validateScheduleMutationAccess(
        Request $request,
        string $workDate,
        ?DailySchedule $existing = null
    ): ?JsonResponse {
        $message = ScheduleMutationPolicy::canMutateSchedule($request->user(), $workDate, $existing);

        if ($message) {
            return $this->error($message, 403);
        }

        return null;
    }

    private function validateScheduleTimingRules(
        string $workDate,
        string $startTime,
        ?DailySchedule $existing = null
    ): ?JsonResponse {
        $message = ScheduleMutationPolicy::validateScheduleTiming($workDate, $startTime, $existing);

        if ($message) {
            return $this->error($message, 422);
        }

        return null;
    }

    private function formatTime(mixed $time): string
    {
        if ($time instanceof \DateTimeInterface) {
            return $time->format('H:i');
        }

        return substr((string) $time, 0, 5);
    }
}
