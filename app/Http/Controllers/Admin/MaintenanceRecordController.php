<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\MaintenanceRecord;
use App\Models\MaintenanceRecordPhoto;
use App\Models\User;
use App\Support\MaintenanceRecordSupport;
use App\Support\MailMergeSupport;
use App\Support\MailPostageAccounting;
use App\Support\MailTrackingSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MaintenanceRecordController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(MaintenanceRecordSupport::statuses())],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'assigned_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = MaintenanceRecord::query()
            ->with([
                'reporter:id,name,account',
                'assignee:id,name,account',
                'schedule:id,work_date,customer_name',
                'photos',
            ])
            ->when(! empty($validated['status']), fn ($builder) => $builder->where('status', $validated['status']))
            ->when(! empty($validated['assigned_user_id']), fn ($builder) => $builder->where('assigned_user_id', $validated['assigned_user_id']))
            ->when(! empty($validated['customer_phone']), function ($builder) use ($validated) {
                $phone = preg_replace('/\s+/', '', $validated['customer_phone']);
                $builder->where('customer_phone', 'like', '%'.$phone.'%');
            })
            ->orderByDesc('created_at');

        $perPage = $validated['per_page'] ?? 20;
        $records = $query->paginate($perPage, ['*'], 'page', $validated['page'] ?? 1);
        $viewer = $request->user();

        return $this->success([
            'records' => collect($records->items())->map(
                fn (MaintenanceRecord $record) => MaintenanceRecordSupport::payload($record, $viewer)
            ),
            'pagination' => [
                'current_page' => $records->currentPage(),
                'per_page' => $records->perPage(),
                'total' => $records->total(),
                'last_page' => $records->lastPage(),
            ],
        ], '維修紀錄查詢成功');
    }

    public function show(Request $request, MaintenanceRecord $maintenanceRecord): JsonResponse
    {
        return $this->success(
            MaintenanceRecordSupport::payload($maintenanceRecord, $request->user()),
            '維修紀錄查詢成功'
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id' => ['nullable', 'integer', 'exists:daily_schedules,id'],
            'assigned_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_phone' => ['required_without:schedule_id', 'nullable', 'string', 'max:50'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_address' => ['nullable', 'string', 'max:255'],
            'fb_display_name' => ['nullable', 'string', 'max:255'],
            'line_display_name' => ['nullable', 'string', 'max:255'],
            'issue_description' => ['required', 'string', 'max:2000'],
            'status' => ['nullable', Rule::in(MaintenanceRecordSupport::statuses())],
            'admin_notes' => ['nullable', 'string', 'max:2000'],
            'follow_up_method' => ['nullable', 'string', 'max:2000'],
        ]);

        if (! empty($validated['schedule_id'])) {
            $schedule = DailySchedule::query()->find($validated['schedule_id']);

            if ($schedule) {
                if (empty($validated['assigned_user_id']) && $schedule->user_id) {
                    $validated['assigned_user_id'] = $schedule->user_id;
                }

                $validated['customer_phone'] = $validated['customer_phone'] ?? $schedule->customer_phone;
                $validated['customer_name'] = $validated['customer_name'] ?? $schedule->customer_name;
                $validated['customer_address'] = $validated['customer_address'] ?? $schedule->customer_address;
                $validated['fb_display_name'] = $validated['fb_display_name'] ?? $schedule->fb_display_name;
                $validated['line_display_name'] = $validated['line_display_name'] ?? $schedule->line_display_name;
            }
        }

        if (trim((string) ($validated['customer_phone'] ?? '')) === '') {
            return $this->error('請填寫客戶電話', 422);
        }

        if (! empty($validated['assigned_user_id']) && ($error = $this->validateEmployee($validated['assigned_user_id']))) {
            return $error;
        }

        $record = MaintenanceRecord::query()->create([
            ...$validated,
            'reported_by' => $request->user()->id,
            'status' => $validated['status'] ?? MaintenanceRecord::STATUS_OPEN,
        ]);

        return $this->success(
            MaintenanceRecordSupport::payload($record, $request->user()),
            '維修紀錄已建立',
            201
        );
    }

    public function update(Request $request, MaintenanceRecord $maintenanceRecord): JsonResponse
    {
        if (! MaintenanceRecordSupport::canEditCompensation($request->user())) {
            return $this->error('無權限更新維修賠款資料', 403);
        }

        $validated = $request->validate([
            'assigned_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'customer_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'customer_address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'fb_display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'line_display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'issue_description' => ['sometimes', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(MaintenanceRecordSupport::statuses())],
            'admin_notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'follow_up_method' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'requires_compensation' => ['sometimes', 'boolean'],
            'is_warranty_case' => ['sometimes', 'boolean'],
            'service_amount' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        if (array_key_exists('assigned_user_id', $validated)
            && $validated['assigned_user_id']
            && ($error = $this->validateEmployee($validated['assigned_user_id']))
        ) {
            return $error;
        }

        if (($validated['status'] ?? null) === MaintenanceRecord::STATUS_RESOLVED) {
            $validated['resolved_at'] = now();
        }

        if (($validated['status'] ?? null) !== MaintenanceRecord::STATUS_RESOLVED
            && ($maintenanceRecord->status === MaintenanceRecord::STATUS_RESOLVED)
            && isset($validated['status'])
        ) {
            $validated['resolved_at'] = null;
        }

        $nextStatus = $validated['status'] ?? $maintenanceRecord->status;
        $nextRequiresCompensation = array_key_exists('requires_compensation', $validated)
            ? (bool) $validated['requires_compensation']
            : (bool) $maintenanceRecord->requires_compensation;
        $nextAmount = array_key_exists('service_amount', $validated)
            ? (int) ($validated['service_amount'] ?? 0)
            : (int) $maintenanceRecord->service_amount;

        if ($nextStatus === MaintenanceRecord::STATUS_RESOLVED
            && $nextRequiresCompensation
            && $nextAmount <= 0
        ) {
            return $this->error('結案需賠款時請填寫賠款總額', 422);
        }

        $maintenanceRecord->fill($validated);
        $maintenanceRecord->save();
        MaintenanceRecordSupport::syncCompensationAdvance($maintenanceRecord->fresh());

        $message = $maintenanceRecord->status === MaintenanceRecord::STATUS_RESOLVED
            && $maintenanceRecord->requires_compensation
            && (int) $maintenanceRecord->service_amount > 0
            ? '已結案，賠款已列入阿泰代墊'
            : ($maintenanceRecord->status === MaintenanceRecord::STATUS_RESOLVED
                ? '已結案'
                : '維修紀錄已更新');

        return $this->success(
            MaintenanceRecordSupport::payload($maintenanceRecord->fresh(), $request->user()),
            $message
        );
    }

    public function uploadPhoto(Request $request, MaintenanceRecord $maintenanceRecord): JsonResponse
    {
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'caption' => ['nullable', 'string', 'max:255'],
        ]);

        $file = $validated['photo'];
        $extension = $file->getClientOriginalExtension() ?: $file->extension();
        $path = $file->storeAs(
            'maintenance-photos/'.$maintenanceRecord->id,
            uniqid('photo_', true).'.'.$extension,
            'public'
        );

        MaintenanceRecordPhoto::query()->create([
            'maintenance_record_id' => $maintenanceRecord->id,
            'uploaded_by' => $request->user()->id,
            'path' => $path,
            'caption' => $validated['caption'] ?? null,
        ]);

        return $this->success(
            MaintenanceRecordSupport::payload($maintenanceRecord->fresh(), $request->user()),
            '照片已上傳'
        );
    }

    public function mailTracking(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year_month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $yearMonth = $validated['year_month'] ?? now()->format('Y-m');
        [$year, $month] = array_map('intval', explode('-', $yearMonth, 2));

        $scheduleQuery = DailySchedule::query()
            ->with([
                'user:id,name,account',
                'cleaningProject',
                'dailyReport:id,schedule_id,needs_invoice_and_mail,needs_receipt_and_mail,invoice_sent,invoice_sent_at,mailed_at,completed_units,collected_amount,paid_to_company,has_tax',
            ])
            ->where('needs_mail', true);

        $pendingSchedules = MailTrackingSupport::uniqueMailTrackingSchedules(
            (clone $scheduleQuery)
                ->where('invoice_sent', false)
                ->orderByRaw('invoice_planned_date is null')
                ->orderBy('invoice_planned_date')
                ->orderByDesc('work_date')
                ->limit(200)
                ->get()
                ->reject(function (DailySchedule $schedule) {
                    $report = $schedule->dailyReport;

                    if (! $report || $report->invoice_sent) {
                        return false;
                    }

                    return MailTrackingSupport::reportRequiresMailTracking($report);
                })
        )
            ->take(100)
            ->map(fn (DailySchedule $schedule) => $this->scheduleMailPayload($schedule));

        $reportQuery = DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->with([
                    'user:id,name,account',
                    'cleaningProject',
                ]),
            ])
            ->where(function ($builder) {
                $builder
                    ->where('needs_invoice_and_mail', true)
                    ->orWhere('needs_receipt_and_mail', true);
            });

        $pendingReports = MailTrackingSupport::uniqueMailTrackingReports(
            (clone $reportQuery)
                ->where('invoice_sent', false)
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
        )->map(fn (DailyReport $report) => $this->reportMailPayload($report));

        $sentMonth = $this->sentMailRecordsForMonth($year, $month);

        return $this->success([
            'year_month' => $yearMonth,
            'pending' => [
                'schedules' => $pendingSchedules,
                'reports' => $pendingReports,
            ],
            'sent_month' => $sentMonth,
            'sent_this_month' => $sentMonth,
            'manual_postage_entries' => MailPostageAccounting::manualPostageEntriesForMonth($year, $month),
            'totals' => MailPostageAccounting::postageTotalsForMonth($year, $month),
            // 保留舊欄位，避免其他地方仍讀 schedules / reports
            'schedules' => $pendingSchedules,
            'reports' => $pendingReports,
        ], '寄件追蹤查詢成功');
    }

    /**
     * @return array{schedules:\Illuminate\Support\Collection<int, array<string, mixed>>, reports:\Illuminate\Support\Collection<int, array<string, mixed>>}
     */
    private function sentMailRecordsForMonth(int $year, int $month): array
    {
        $sentSchedules = MailTrackingSupport::uniqueMailTrackingSchedules(
            MailPostageAccounting::sentSchedulesForMonthQuery($year, $month)
                ->with([
                    'user:id,name,account',
                    'cleaningProject',
                    'dailyReport:id,schedule_id,needs_invoice_and_mail,needs_receipt_and_mail,invoice_sent,invoice_sent_at,mailed_at,completed_units,collected_amount,paid_to_company,has_tax',
                ])
                ->orderByDesc('mailed_at')
                ->orderByDesc('id')
                ->limit(200)
                ->get()
                ->reject(function (DailySchedule $schedule) {
                    $report = $schedule->dailyReport;

                    if (! $report || ! $report->invoice_sent) {
                        return false;
                    }

                    return MailTrackingSupport::reportRequiresMailTracking($report);
                })
        )
            ->take(100)
            ->map(fn (DailySchedule $schedule) => $this->scheduleMailPayload($schedule));

        $sentReports = MailTrackingSupport::uniqueMailTrackingReports(
            MailPostageAccounting::sentReportsForMonthQuery($year, $month)
                ->with([
                    'dailySchedule' => fn ($query) => $query->with([
                        'user:id,name,account',
                        'cleaningProject',
                    ]),
                ])
                ->orderByDesc('mailed_at')
                ->orderByDesc('id')
                ->limit(200)
                ->get()
        )
            ->take(100)
            ->map(fn (DailyReport $report) => $this->reportMailPayload($report));

        return [
            'schedules' => $sentSchedules->values(),
            'reports' => $sentReports->values(),
        ];
    }

    public function searchMailHistory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tax_id' => ['nullable', 'string', 'max:20'],
            'title' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);

        $taxId = trim((string) ($validated['tax_id'] ?? ''));
        $title = trim((string) ($validated['title'] ?? ''));
        $phone = trim((string) ($validated['phone'] ?? ''));

        if ($taxId === '' && $title === '' && $phone === '') {
            return $this->error('請至少輸入一項查詢條件', 422);
        }

        $scheduleQuery = DailySchedule::query()
            ->with(['user:id,name,account'])
            ->where('invoice_sent', true)
            ->where(function ($builder) {
                $builder
                    ->where('needs_mail', true)
                    ->orWhere('needs_invoice', true)
                    ->orWhere('needs_receipt', true);
            });

        $this->applyMailHistoryFilters($scheduleQuery, $taxId, $title, $phone);

        $schedules = $scheduleQuery
            ->orderByDesc('mailed_at')
            ->orderByDesc('work_date')
            ->limit(50)
            ->get()
            ->map(fn (DailySchedule $schedule) => $this->scheduleMailPayload($schedule));

        $reportQuery = DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->with('user:id,name,account'),
            ])
            ->where('invoice_sent', true)
            ->where(function ($builder) {
                $builder
                    ->where('needs_invoice_and_mail', true)
                    ->orWhere('needs_receipt_and_mail', true);
            })
            ->whereHas('dailySchedule', function ($query) use ($taxId, $title, $phone) {
                $this->applyMailHistoryFilters($query, $taxId, $title, $phone);
            });

        $reports = $reportQuery
            ->orderByDesc('mailed_at')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (DailyReport $report) => $this->reportMailPayload($report));

        return $this->success([
            'schedules' => $schedules,
            'reports' => $reports,
        ], '歷史寄信查詢成功');
    }

    public function updateScheduleMailTracking(Request $request, DailySchedule $schedule): JsonResponse
    {
        if (! MailTrackingSupport::scheduleRequiresMailTracking($schedule)
            && ! $schedule->invoice_sent
            && ! ((bool) $schedule->needs_invoice || (bool) $schedule->needs_receipt)) {
            return $this->error('此班表不需寄件追蹤', 422);
        }

        $validated = $request->validate([
            'mail_recipient' => ['nullable', 'string', 'max:255'],
            'mail_phone' => ['nullable', 'string', 'max:50'],
            'mail_address' => ['nullable', 'string', 'max:255'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'mail_tracking_number' => ['nullable', 'string', 'max:50'],
            'invoice_sent' => ['nullable', 'boolean'],
            'mailed_at' => ['nullable', 'date'],
        ]);

        $this->applyMailTrackingFields($schedule, $validated);

        $wasSent = $schedule->invoice_sent;
        $this->applyScheduleMailSentState($schedule, $validated, $wasSent);

        $schedule->save();

        return $this->success(
            $this->scheduleMailPayload($schedule->fresh()->load('user:id,name,account')),
            ! empty($validated['invoice_sent']) && ! $wasSent
                ? '已標記寄出完成'
                : '寄件資料已更新'
        );
    }

    public function updateReportMailTracking(Request $request, DailyReport $report): JsonResponse
    {
        if (! $report->needs_invoice_and_mail && ! $report->needs_receipt_and_mail) {
            return $this->error('此回報不需寄件追蹤', 422);
        }

        $validated = $request->validate([
            'mail_recipient' => ['nullable', 'string', 'max:255'],
            'mail_phone' => ['nullable', 'string', 'max:50'],
            'mail_address' => ['nullable', 'string', 'max:255'],
            'invoice_tax_id' => ['nullable', 'string', 'max:20'],
            'invoice_title' => ['nullable', 'string', 'max:255'],
            'mail_tracking_number' => ['nullable', 'string', 'max:50'],
            'invoice_sent' => ['nullable', 'boolean'],
            'mailed_at' => ['nullable', 'date'],
        ]);

        $schedule = $report->dailySchedule;
        $wasReportSent = $report->invoice_sent;
        $wasScheduleSent = (bool) ($schedule?->invoice_sent);

        if ($schedule) {
            $this->applyMailTrackingFields($schedule, $validated);
            $this->applyScheduleMailSentState($schedule, $validated, $wasScheduleSent);
            $schedule->save();
        }

        $this->applyReportMailSentState($report, $validated, $wasReportSent);

        if ($report->isDirty()) {
            $report->save();
        }

        return $this->success(
            $this->reportMailPayload($report->fresh()->load([
                'dailySchedule' => fn ($query) => $query->with('user:id,name,account'),
            ])),
            ! empty($validated['invoice_sent']) && ! $wasReportSent
                ? '已標記寄出完成'
                : '寄件資料已更新'
        );
    }

    public function markScheduleMailSent(DailySchedule $schedule): JsonResponse
    {
        $schedule->invoice_sent = true;
        $schedule->invoice_sent_at = now();
        $schedule->mailed_at = now()->toDateString();
        $schedule->save();

        return $this->success($schedule->fresh(), '班表寄件狀態已更新');
    }

    public function markReportMailSent(DailyReport $report): JsonResponse
    {
        $report->invoice_sent = true;
        $report->invoice_sent_at = now();
        $report->mailed_at = now()->toDateString();
        $report->save();

        return $this->success($report->fresh()->load('dailySchedule.user:id,name,account'), '回報寄件狀態已更新');
    }

    public function mergeMailTracking(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_ids' => ['required', 'array', 'min:2', 'max:50'],
            'schedule_ids.*' => ['integer', 'exists:daily_schedules,id'],
        ]);

        try {
            $groupId = MailMergeSupport::mergeSchedules($validated['schedule_ids']);
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success([
            'mail_merge_group_id' => $groupId,
            'schedule_ids' => $validated['schedule_ids'],
        ], '已合併寄件，郵資僅計一次');
    }

    public function unmergeMailTracking(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_ids' => ['required', 'array', 'min:1', 'max:50'],
            'schedule_ids.*' => ['integer', 'exists:daily_schedules,id'],
        ]);

        try {
            MailMergeSupport::unmergeSchedules($validated['schedule_ids']);
        } catch (\InvalidArgumentException $exception) {
            return $this->error($exception->getMessage(), 422);
        }

        return $this->success([
            'schedule_ids' => $validated['schedule_ids'],
        ], '已取消合併寄件');
    }

    private function validateEmployee(int $userId): ?JsonResponse
    {
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

    /**
     * @return array<string, mixed>
     */
    private function scheduleMailPayload(DailySchedule $schedule): array
    {
        $schedule->loadMissing(['cleaningProject', 'dailyReport']);
        $billing = MailTrackingSupport::resolveMailBilling($schedule, $schedule->dailyReport);

        return [
            'id' => $schedule->id,
            'cleaning_project_id' => $schedule->cleaning_project_id,
            'cleaning_project' => MailTrackingSupport::projectMailPayload($schedule->cleaningProject),
            'work_date' => $schedule->work_date?->format('Y-m-d'),
            'customer_name' => $schedule->customer_name,
            'customer_phone' => $schedule->customer_phone,
            'customer_address' => $schedule->customer_address,
            'customer_source' => $schedule->customer_source,
            'fb_display_name' => $schedule->fb_display_name,
            'line_display_name' => $schedule->line_display_name,
            'mail_recipient' => $schedule->mail_recipient,
            'mail_phone' => $schedule->mail_phone,
            'mail_address' => $schedule->mail_address,
            'invoice_tax_id' => $schedule->invoice_tax_id,
            'invoice_title' => $schedule->invoice_title,
            'invoice_planned_date' => $schedule->invoice_planned_date?->format('Y-m-d'),
            'invoice_charge_customer_tax' => (bool) $schedule->invoice_charge_customer_tax,
            'ac_units' => (int) $schedule->ac_units,
            'cleaning_price' => (int) $schedule->cleaning_price,
            'mail_tracking_number' => $schedule->mail_tracking_number,
            'mail_merge_group_id' => $schedule->mail_merge_group_id,
            'needs_mail' => (bool) $schedule->needs_mail,
            'needs_invoice' => (bool) $schedule->needs_invoice,
            'needs_receipt' => (bool) $schedule->needs_receipt,
            'invoice_sent' => (bool) $schedule->invoice_sent,
            'invoice_sent_at' => $schedule->invoice_sent_at?->toDateTimeString(),
            'mailed_at' => $schedule->mailed_at?->format('Y-m-d'),
            'user' => $schedule->user,
            'daily_report' => $schedule->dailyReport,
            'billing_units' => $billing['units'],
            'billing_amount' => $billing['amount'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function reportMailPayload(DailyReport $report): array
    {
        $schedule = $report->dailySchedule;
        $schedule?->loadMissing('cleaningProject');
        $billing = $schedule
            ? MailTrackingSupport::resolveMailBilling($schedule, $report)
            : ['units' => (int) $report->completed_units, 'amount' => (int) $report->collected_amount];

        return [
            'id' => $report->id,
            'invoice_sent' => (bool) $report->invoice_sent,
            'invoice_sent_at' => $report->invoice_sent_at?->toDateTimeString(),
            'mailed_at' => $report->mailed_at?->format('Y-m-d'),
            'needs_invoice_and_mail' => (bool) $report->needs_invoice_and_mail,
            'needs_receipt_and_mail' => (bool) $report->needs_receipt_and_mail,
            'completed_units' => (int) $report->completed_units,
            'collected_amount' => (int) $report->collected_amount,
            'paid_to_company' => (bool) $report->paid_to_company,
            'has_tax' => (bool) $report->has_tax,
            'billing_units' => $billing['units'],
            'billing_amount' => $billing['amount'],
            'daily_schedule' => $schedule ? [
                'id' => $schedule->id,
                'cleaning_project_id' => $schedule->cleaning_project_id,
                'cleaning_project' => MailTrackingSupport::projectMailPayload($schedule->cleaningProject),
                'work_date' => $schedule->work_date?->format('Y-m-d'),
                'customer_name' => $schedule->customer_name,
                'customer_phone' => $schedule->customer_phone,
                'customer_address' => $schedule->customer_address,
                'customer_source' => $schedule->customer_source,
                'fb_display_name' => $schedule->fb_display_name,
                'line_display_name' => $schedule->line_display_name,
                'mail_recipient' => $schedule->mail_recipient,
                'mail_phone' => $schedule->mail_phone,
                'mail_address' => $schedule->mail_address,
                'invoice_tax_id' => $schedule->invoice_tax_id,
                'invoice_title' => $schedule->invoice_title,
                'mail_tracking_number' => $schedule->mail_tracking_number,
                'mail_merge_group_id' => $schedule->mail_merge_group_id,
                'needs_mail' => (bool) $schedule->needs_mail,
                'needs_invoice' => (bool) $schedule->needs_invoice,
                'needs_receipt' => (bool) $schedule->needs_receipt,
                'invoice_planned_date' => $schedule->invoice_planned_date?->format('Y-m-d'),
                'invoice_charge_customer_tax' => (bool) $schedule->invoice_charge_customer_tax,
                'ac_units' => (int) $schedule->ac_units,
                'cleaning_price' => (int) $schedule->cleaning_price,
                'user' => $schedule->user,
            ] : null,
        ];
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<DailySchedule>  $query
     */
    private function applyMailHistoryFilters($query, string $taxId, string $title, string $phone): void
    {
        if ($taxId !== '') {
            $query->where('invoice_tax_id', 'like', '%'.$taxId.'%');
        }

        if ($title !== '') {
            $query->where('invoice_title', 'like', '%'.$title.'%');
        }

        if ($phone !== '') {
            $query->where('mail_phone', 'like', '%'.$phone.'%');
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function applyMailTrackingFields(DailySchedule $schedule, array $validated): void
    {
        $stringFields = [
            'mail_recipient',
            'mail_phone',
            'mail_address',
            'invoice_tax_id',
            'invoice_title',
            'mail_tracking_number',
        ];

        foreach ($stringFields as $field) {
            if (! array_key_exists($field, $validated)) {
                continue;
            }

            $schedule->{$field} = $validated[$field] !== ''
                ? trim((string) $validated[$field])
                : null;
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function applyScheduleMailSentState(DailySchedule $schedule, array $validated, bool $wasSent): void
    {
        if (array_key_exists('invoice_sent', $validated)) {
            if (! empty($validated['invoice_sent'])) {
                if (! $wasSent) {
                    $schedule->invoice_sent_at = now();
                }

                $schedule->invoice_sent = true;

                if (array_key_exists('mailed_at', $validated)) {
                    $schedule->mailed_at = MailPostageAccounting::resolveMailedAt(
                        $validated['mailed_at'],
                        ! $wasSent,
                    );
                } elseif (! $wasSent) {
                    $schedule->mailed_at = MailPostageAccounting::resolveMailedAt(null, true);
                }

                return;
            }

            return;
        }

        if ($schedule->invoice_sent && array_key_exists('mailed_at', $validated)) {
            $schedule->mailed_at = MailPostageAccounting::resolveMailedAt(
                $validated['mailed_at'],
                false,
            );
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function applyReportMailSentState(DailyReport $report, array $validated, bool $wasSent): void
    {
        if (array_key_exists('invoice_sent', $validated)) {
            if (! empty($validated['invoice_sent'])) {
                if (! $wasSent) {
                    $report->invoice_sent_at = now();
                }

                $report->invoice_sent = true;

                if (array_key_exists('mailed_at', $validated)) {
                    $report->mailed_at = MailPostageAccounting::resolveMailedAt(
                        $validated['mailed_at'],
                        ! $wasSent,
                    );
                } elseif (! $wasSent) {
                    $report->mailed_at = MailPostageAccounting::resolveMailedAt(null, true);
                }

                return;
            }

            return;
        }

        if ($report->invoice_sent && array_key_exists('mailed_at', $validated)) {
            $report->mailed_at = MailPostageAccounting::resolveMailedAt(
                $validated['mailed_at'],
                false,
            );
        }
    }
}
