<?php

namespace App\Support;

use App\Models\CleaningProject;
use App\Models\DailySchedule;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CleaningProjectSupport
{
    /**
     * @return array<string, string>
     */
    public static function statusLabels(): array
    {
        return [
            CleaningProject::STATUS_IN_PROGRESS => '施作中',
            CleaningProject::STATUS_PENDING_INVOICE => '完工待發票',
            CleaningProject::STATUS_PENDING_PAYMENT => '待請款流程',
            CleaningProject::STATUS_CLOSED => '已結案',
        ];
    }

    public static function statusLabel(string $status): string
    {
        return self::statusLabels()[$status] ?? $status;
    }

    /**
     * @return list<string>
     */
    public static function allowedStatuses(): array
    {
        return [
            CleaningProject::STATUS_IN_PROGRESS,
            CleaningProject::STATUS_PENDING_INVOICE,
            CleaningProject::STATUS_PENDING_PAYMENT,
            CleaningProject::STATUS_CLOSED,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  list<int>  $employeeIds
     */
    public static function createProject(array $payload, array $employeeIds, User $creator): CleaningProject
    {
        return DB::transaction(function () use ($payload, $employeeIds, $creator) {
            $lines = SchedulePricing::normalizeLines($payload['pricing_lines'] ?? null);
            $summary = SchedulePricing::summarizeLines($lines, false);
            $needsInvoice = (bool) ($summary['needs_invoice'] ?? false)
                || (bool) ($payload['needs_invoice'] ?? false);
            $triplicateLine = collect($lines)->first(
                fn (array $line) => ($line['invoice_type'] ?? '') === SchedulePricing::INVOICE_TYPE_TRIPLICATE
            );

            $startDate = Carbon::parse($payload['planned_start_date'])->startOfDay();
            $endDate = Carbon::parse($payload['planned_end_date'])->startOfDay();

            if ($endDate->lt($startDate)) {
                throw new \InvalidArgumentException('工期結束日不可早於開始日');
            }

            $project = CleaningProject::query()->create([
                'project_code' => self::generateProjectCode(),
                'title' => $payload['title'] ?? null,
                'status' => CleaningProject::STATUS_IN_PROGRESS,
                'created_by' => $creator->id,
                'customer_name' => $payload['customer_name'],
                'customer_phone' => $payload['customer_phone'],
                'customer_address' => $payload['customer_address'],
                'service_area' => $payload['service_area'] ?? null,
                'customer_source' => $payload['customer_source'],
                'fb_display_name' => $payload['fb_display_name'] ?? null,
                'line_display_name' => $payload['line_display_name'] ?? null,
                'total_ac_units' => $summary['ac_units'],
                'pricing_lines' => $lines,
                'ac_units' => $summary['ac_units'],
                'unit_price' => $summary['unit_price'],
                'cleaning_price' => $summary['cleaning_price'],
                'needs_invoice' => $needsInvoice,
                'needs_receipt' => (bool) ($payload['needs_receipt'] ?? false),
                'expects_company_remittance' => (bool) ($payload['expects_company_remittance'] ?? false),
                'needs_mail' => (bool) ($payload['needs_mail'] ?? false),
                'mail_recipient' => $payload['mail_recipient'] ?? null,
                'mail_phone' => $payload['mail_phone'] ?? null,
                'mail_address' => $payload['mail_address'] ?? null,
                'invoice_tax_id' => is_array($triplicateLine)
                    ? ($triplicateLine['invoice_tax_id'] ?? $payload['invoice_tax_id'] ?? null)
                    : ($payload['invoice_tax_id'] ?? null),
                'invoice_title' => is_array($triplicateLine)
                    ? ($triplicateLine['invoice_title'] ?? $payload['invoice_title'] ?? null)
                    : ($payload['invoice_title'] ?? null),
                'planned_start_date' => $startDate->toDateString(),
                'planned_end_date' => $endDate->toDateString(),
                'notes' => $payload['notes'] ?? null,
            ]);

            $assignments = self::distributeUnitsAmongEmployees($summary['ac_units'], $employeeIds);

            $project->employees()->sync(collect($employeeIds)->mapWithKeys(fn ($id) => [
                (int) $id => [
                    'role' => 'member',
                    'assigned_units' => $assignments[(int) $id] ?? 0,
                ],
            ])->all());

            self::generateProjectSchedules(
                $project,
                $employeeIds,
                $lines,
                $needsInvoice,
                $payload['start_time'] ?? '09:00',
                $payload['end_time'] ?? '21:00',
            );

            return $project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']);
        });
    }

    /**
     * @param  list<int>  $employeeIds
     * @return array<int, int>
     */
    public static function distributeUnitsAmongEmployees(int $totalUnits, array $employeeIds): array
    {
        $employeeIds = array_values(array_unique(array_map('intval', $employeeIds)));

        if ($employeeIds === []) {
            return [];
        }

        $baseUnits = intdiv($totalUnits, count($employeeIds));
        $remainder = $totalUnits % count($employeeIds);
        $assignments = [];

        foreach ($employeeIds as $index => $employeeId) {
            $assignments[$employeeId] = max(0, $baseUnits + ($index < $remainder ? 1 : 0));
        }

        return $assignments;
    }

    /**
     * @param  list<int>  $employeeIds
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     */
    public static function generateProjectSchedules(
        CleaningProject $project,
        array $employeeIds,
        array $lines,
        bool $needsInvoice,
        string $startTime = '09:00',
        string $endTime = '21:00',
        string $scheduleKind = CleaningProject::SCHEDULE_KIND_REGULAR,
    ): void {
        if ($employeeIds === []) {
            return;
        }

        $dates = collect(CarbonPeriod::create(
            $project->planned_start_date,
            $project->planned_end_date,
        ))->map(fn (Carbon $date) => $date->toDateString())->values();

        if ($dates->isEmpty()) {
            return;
        }

        $assignments = self::employeeAssignmentMap($project, $employeeIds);
        $startDate = $dates->first();

        foreach ($employeeIds as $employeeId) {
            $units = (int) ($assignments[(int) $employeeId] ?? 0);

            if ($units > 0) {
                self::createProjectScheduleRecord(
                    $project,
                    (int) $employeeId,
                    (string) $startDate,
                    $units,
                    $lines,
                    $needsInvoice,
                    $startTime,
                    $endTime,
                    CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                );
            }

            foreach ($dates->skip(1) as $date) {
                self::createProjectScheduleRecord(
                    $project,
                    (int) $employeeId,
                    (string) $date,
                    0,
                    $lines,
                    $needsInvoice,
                    $startTime,
                    $endTime,
                    CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK,
                    autoReport: false,
                );
            }
        }
    }

    /**
     * @param  list<int>  $employeeIds
     * @return array<int, int>
     */
    private static function employeeAssignmentMap(CleaningProject $project, array $employeeIds): array
    {
        $project->loadMissing('employees');
        $assignments = [];

        foreach ($employeeIds as $employeeId) {
            $employee = $project->employees->firstWhere('id', (int) $employeeId);
            $assignments[(int) $employeeId] = (int) ($employee?->pivot?->assigned_units ?? 0);
        }

        if (array_sum($assignments) < 1) {
            return self::distributeUnitsAmongEmployees((int) $project->total_ac_units, $employeeIds);
        }

        return $assignments;
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     */
    private static function createProjectScheduleRecord(
        CleaningProject $project,
        int $employeeId,
        string $workDate,
        int $units,
        array $lines,
        bool $needsInvoice,
        string $startTime,
        string $endTime,
        string $scheduleKind,
        bool $autoReport = true,
    ): DailySchedule {
        $scheduleLines = $units > 0 ? self::linesForUnits($lines, $units) : [];
        $summary = $units > 0
            ? SchedulePricing::summarizeLines($scheduleLines, $needsInvoice)
            : [
                'ac_units' => 0,
                'unit_price' => (int) ($lines[0]['unit_price'] ?? 1500),
                'cleaning_price' => 0,
                'task_details' => '專案工期',
            ];

        $schedule = DailySchedule::query()->create([
            'cleaning_project_id' => $project->id,
            'schedule_kind' => $scheduleKind,
            'user_id' => $employeeId,
            'work_date' => $workDate,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'customer_name' => $project->customer_name,
            'customer_phone' => $project->customer_phone,
            'customer_address' => $project->customer_address,
            'mail_recipient' => $project->mail_recipient,
            'mail_phone' => $project->mail_phone,
            'mail_address' => $project->mail_address,
            'needs_mail' => $project->needs_mail,
            'service_area' => $project->service_area,
            'customer_source' => $project->customer_source,
            'fb_display_name' => $project->fb_display_name,
            'line_display_name' => $project->line_display_name,
            'pricing_lines' => $scheduleLines,
            'units_allocated' => $units,
            'ac_units' => $summary['ac_units'],
            'unit_price' => $summary['unit_price'],
            'cleaning_price' => $summary['cleaning_price'],
            'task_details' => $summary['task_details'],
            'needs_invoice' => $needsInvoice,
            'needs_receipt' => (bool) $project->needs_receipt,
            'needs_mail' => $project->needs_mail,
            'invoice_tax_id' => $project->invoice_tax_id,
            'invoice_title' => $project->invoice_title,
            'notes' => $project->notes,
        ]);

        if ($autoReport) {
            ScheduleBackfillSupport::createReportIfPastBackfill($schedule);
        }

        return $schedule;
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @return list<array{ac_units:int, unit_price:int}>
     */
    public static function linesForUnits(array $lines, int $units): array
    {
        if ($lines === []) {
            return [['ac_units' => max(1, $units), 'unit_price' => 1500]];
        }

        $primary = $lines[0];

        return [[
            'ac_units' => max(1, $units),
            'unit_price' => (int) $primary['unit_price'],
            'is_taxable' => (bool) ($primary['is_taxable'] ?? false),
            'invoice_type' => $primary['invoice_type'] ?? SchedulePricing::INVOICE_TYPE_NONE,
            'invoice_title' => $primary['invoice_title'] ?? null,
            'invoice_tax_id' => $primary['invoice_tax_id'] ?? null,
            'charge_customer_tax' => (bool) ($primary['charge_customer_tax'] ?? false),
        ]];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function addSupplementSchedule(CleaningProject $project, array $payload): DailySchedule
    {
        return DB::transaction(function () use ($project, $payload) {
            $needsInvoice = (bool) $project->needs_invoice;
            $lines = SchedulePricing::normalizeLines($payload['pricing_lines'] ?? null);
            $summary = SchedulePricing::summarizeLines($lines, $needsInvoice);

            $schedule = DailySchedule::query()->create([
                'cleaning_project_id' => $project->id,
                'schedule_kind' => CleaningProject::SCHEDULE_KIND_SUPPLEMENT,
                'user_id' => (int) $payload['user_id'],
                'work_date' => $payload['work_date'],
                'start_time' => $payload['start_time'] ?? '09:00',
                'end_time' => $payload['end_time'] ?? '12:00',
                'customer_name' => $project->customer_name,
                'customer_phone' => $project->customer_phone,
                'customer_address' => $project->customer_address,
                'mail_recipient' => $project->mail_recipient,
                'mail_phone' => $project->mail_phone,
                'mail_address' => $project->mail_address,
                'needs_mail' => $project->needs_mail,
                'service_area' => $project->service_area,
                'customer_source' => $project->customer_source,
                'fb_display_name' => $project->fb_display_name,
                'line_display_name' => $project->line_display_name,
                'pricing_lines' => $lines,
                'units_allocated' => $summary['ac_units'],
                'ac_units' => $summary['ac_units'],
                'unit_price' => $summary['unit_price'],
                'cleaning_price' => $summary['cleaning_price'],
                'task_details' => $summary['task_details'],
                'needs_invoice' => $needsInvoice,
                'needs_receipt' => (bool) $project->needs_receipt,
                'needs_mail' => $project->needs_mail,
                'invoice_tax_id' => $project->invoice_tax_id,
                'invoice_title' => $project->invoice_title,
                'notes' => $payload['notes'] ?? '補台數',
            ]);

            ScheduleBackfillSupport::createReportIfPastBackfill($schedule);

            self::recalculateProjectTotals($project);

            if ($project->status === CleaningProject::STATUS_CLOSED) {
                $project->status = CleaningProject::STATUS_IN_PROGRESS;
                $project->completed_at = null;
                $project->save();
            }

            return $schedule->load(['user', 'dailyReport', 'cleaningProject']);
        });
    }

    public static function recalculateProjectTotals(CleaningProject $project): void
    {
        $totals = DailySchedule::query()
            ->where('cleaning_project_id', $project->id)
            ->where('schedule_kind', '!=', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
            ->selectRaw('COALESCE(SUM(ac_units), 0) as units, COALESCE(SUM(cleaning_price), 0) as price')
            ->first();

        $project->total_ac_units = (int) ($totals->units ?? 0);
        $project->ac_units = (int) ($totals->units ?? 0);
        $project->cleaning_price = (int) ($totals->price ?? 0);
        $project->save();
    }

    /**
     * @return array{
     *   total_units:int,
     *   completed_units:int,
     *   remaining_units:int,
     *   duration_days:int,
     *   schedule_count:int
     * }
     */
    public static function progress(CleaningProject $project): array
    {
        $schedules = $project->schedules()
            ->where('schedule_kind', '!=', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
            ->with('dailyReport')
            ->get();
        $completedUnits = (int) $schedules->sum(fn (DailySchedule $schedule) => (int) ($schedule->dailyReport?->completed_units ?? 0));
        $totalUnits = (int) $project->total_ac_units;
        $start = Carbon::parse($project->planned_start_date);
        $end = Carbon::parse($project->planned_end_date);

        return [
            'total_units' => $totalUnits,
            'completed_units' => $completedUnits,
            'remaining_units' => max(0, $totalUnits - $completedUnits),
            'duration_days' => $start->diffInDays($end) + 1,
            'schedule_count' => $schedules->count(),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function employeeAssignments(CleaningProject $project): array
    {
        $project->loadMissing(['employees', 'schedules.dailyReport']);

        $settlementSchedules = $project->schedules
            ->filter(fn (DailySchedule $schedule) => in_array($schedule->schedule_kind, [
                CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                CleaningProject::SCHEDULE_KIND_REGULAR,
                CleaningProject::SCHEDULE_KIND_SUPPLEMENT,
            ], true));

        return $project->employees->map(function (User $employee) use ($settlementSchedules) {
            $employeeSchedules = $settlementSchedules->where('user_id', $employee->id);
            $assignmentSchedule = $employeeSchedules->first(fn (DailySchedule $schedule) => in_array($schedule->schedule_kind, [
                CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                CleaningProject::SCHEDULE_KIND_REGULAR,
            ], true));
            $assignedUnits = (int) ($employee->pivot?->assigned_units ?? 0);

            if ($assignedUnits < 1) {
                $assignedUnits = (int) $employeeSchedules
                    ->whereIn('schedule_kind', [
                        CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                        CleaningProject::SCHEDULE_KIND_REGULAR,
                    ])
                    ->sum('ac_units');
            }

            $completedUnits = (int) $employeeSchedules->sum(
                fn (DailySchedule $schedule) => (int) ($schedule->dailyReport?->completed_units ?? 0)
            );
            $supplementUnits = (int) $employeeSchedules
                ->where('schedule_kind', CleaningProject::SCHEDULE_KIND_SUPPLEMENT)
                ->sum('ac_units');

            return [
                'user_id' => $employee->id,
                'name' => $employee->name,
                'account' => $employee->account,
                'avatar_url' => $employee->avatar_url,
                'assigned_units' => $assignedUnits,
                'completed_units' => $completedUnits,
                'supplement_units' => $supplementUnits,
                'settlement_schedule_id' => $assignmentSchedule?->id,
                'unit_price' => (int) ($assignmentSchedule?->unit_price ?? 0),
            ];
        })->values()->all();
    }

    public static function payload(CleaningProject $project, bool $detailed = false): array
    {
        $project->loadMissing(['employees:id,name,account,avatar_path', 'creator:id,name,account']);

        $data = [
            'id' => $project->id,
            'project_code' => $project->project_code,
            'title' => $project->title,
            'status' => $project->status,
            'status_label' => self::statusLabel($project->status),
            'customer_name' => $project->customer_name,
            'customer_phone' => $project->customer_phone,
            'customer_address' => $project->customer_address,
            'service_area' => $project->service_area,
            'customer_source' => $project->customer_source,
            'total_ac_units' => (int) $project->total_ac_units,
            'ac_units' => (int) $project->ac_units,
            'cleaning_price' => (int) $project->cleaning_price,
            'pricing_lines' => $project->pricing_lines,
            'needs_invoice' => (bool) $project->needs_invoice,
            'needs_receipt' => (bool) $project->needs_receipt,
            'expects_company_remittance' => (bool) $project->expects_company_remittance,
            'needs_mail' => (bool) $project->needs_mail,
            'mail_recipient' => $project->mail_recipient,
            'mail_phone' => $project->mail_phone,
            'mail_address' => $project->mail_address,
            'invoice_tax_id' => $project->invoice_tax_id,
            'invoice_title' => $project->invoice_title,
            'planned_start_date' => $project->planned_start_date?->format('Y-m-d'),
            'planned_end_date' => $project->planned_end_date?->format('Y-m-d'),
            'completed_at' => $project->completed_at?->toIso8601String(),
            'notes' => $project->notes,
            'progress' => self::progress($project),
            'employees' => $project->employees->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'account' => $user->account,
                'avatar_url' => $user->avatar_url,
                'assigned_units' => (int) ($user->pivot?->assigned_units ?? 0),
            ])->values(),
            'employee_assignments' => self::employeeAssignments($project),
            'creator' => $project->creator ? [
                'id' => $project->creator->id,
                'name' => $project->creator->name,
            ] : null,
            'created_at' => $project->created_at?->toIso8601String(),
        ];

        if ($detailed) {
            $data['schedules'] = $project->schedules()
                ->with(['user:id,name,account,avatar_path', 'dailyReport'])
                ->orderBy('work_date')
                ->orderBy('start_time')
                ->get()
                ->map(fn (DailySchedule $schedule) => self::schedulePayload($schedule))
                ->values();
            $data['calendar_blocks'] = collect($data['schedules'])
                ->where('schedule_kind', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
                ->values()
                ->all();
            $data['schedules'] = collect($data['schedules'])
                ->reject(fn (array $schedule) => $schedule['schedule_kind'] === CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
                ->values()
                ->all();
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    public static function schedulePayload(DailySchedule $schedule): array
    {
        $schedule->loadMissing(['user', 'dailyReport', 'cleaningProject']);

        return array_merge($schedule->toArray(), [
            'work_date' => $schedule->work_date?->format('Y-m-d'),
            'daily_report' => $schedule->dailyReport,
            'cleaning_project' => $schedule->cleaningProject ? [
                'id' => $schedule->cleaningProject->id,
                'project_code' => $schedule->cleaningProject->project_code,
                'title' => $schedule->cleaningProject->title,
                'status' => $schedule->cleaningProject->status,
                'status_label' => self::statusLabel($schedule->cleaningProject->status),
                'planned_start_date' => $schedule->cleaningProject->planned_start_date?->format('Y-m-d'),
                'planned_end_date' => $schedule->cleaningProject->planned_end_date?->format('Y-m-d'),
                'duration_days' => Carbon::parse($schedule->cleaningProject->planned_start_date)
                    ->diffInDays(Carbon::parse($schedule->cleaningProject->planned_end_date)) + 1,
                'total_ac_units' => (int) $schedule->cleaningProject->total_ac_units,
            ] : null,
        ]);
    }

    public static function generateProjectCode(): string
    {
        return 'P'.now()->format('ymd').'-'.Str::upper(Str::random(4));
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>|null  $pricingLines
     */
    public static function updateProjectUnits(CleaningProject $project, int $totalUnits, ?array $pricingLines = null): CleaningProject
    {
        if ($totalUnits < 1) {
            throw new \InvalidArgumentException('總台數至少需 1 台');
        }

        return DB::transaction(function () use ($project, $totalUnits, $pricingLines) {
            $needsInvoice = (bool) $project->needs_invoice;
            $lines = SchedulePricing::normalizeLines($pricingLines ?? $project->pricing_lines ?? []);
            $projectLines = self::linesForUnits($lines, $totalUnits);
            $summary = SchedulePricing::summarizeLines($projectLines, $needsInvoice);
            $employeeIds = $project->employees()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
            $assignments = self::distributeUnitsAmongEmployees($totalUnits, $employeeIds);

            $project->total_ac_units = $totalUnits;
            $project->pricing_lines = $projectLines;
            $project->ac_units = $totalUnits;
            $project->unit_price = $summary['unit_price'];
            $project->cleaning_price = $summary['cleaning_price'];
            $project->save();

            $project->employees()->sync(collect($employeeIds)->mapWithKeys(fn ($id) => [
                $id => [
                    'role' => 'member',
                    'assigned_units' => $assignments[$id] ?? 0,
                ],
            ])->all());

            self::syncAssignmentSchedules($project, $lines, $needsInvoice);

            self::recalculateProjectTotals($project);

            return $project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']);
        });
    }

    /**
     * @param  list<array{user_id:int, assigned_units:int}>  $assignments
     */
    public static function updateEmployeeAssignments(CleaningProject $project, array $assignments): CleaningProject
    {
        return DB::transaction(function () use ($project, $assignments) {
            $needsInvoice = (bool) $project->needs_invoice;
            $lines = SchedulePricing::normalizeLines($project->pricing_lines ?? []);
            $memberIds = $project->employees()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
            $updates = [];

            foreach ($assignments as $assignment) {
                $userId = (int) ($assignment['user_id'] ?? 0);
                $units = (int) ($assignment['assigned_units'] ?? 0);

                if (! in_array($userId, $memberIds, true)) {
                    throw new \InvalidArgumentException('師傅不屬於此專案');
                }

                if ($units < 0) {
                    throw new \InvalidArgumentException('分派台數不可小於 0');
                }

                $updates[$userId] = $units;
            }

            $assignedTotal = array_sum($updates);

            if ($assignedTotal < 1) {
                throw new \InvalidArgumentException('師傅分派台數至少需 1 台');
            }

            if ($assignedTotal !== (int) $project->total_ac_units) {
                $projectLines = self::linesForUnits($lines, $assignedTotal);
                $summary = SchedulePricing::summarizeLines($projectLines, $needsInvoice);
                $project->total_ac_units = $assignedTotal;
                $project->pricing_lines = $projectLines;
                $project->ac_units = $assignedTotal;
                $project->unit_price = $summary['unit_price'];
                $project->cleaning_price = $summary['cleaning_price'];
                $project->save();
            }

            $project->employees()->sync(collect($memberIds)->mapWithKeys(fn ($id) => [
                $id => [
                    'role' => 'member',
                    'assigned_units' => $updates[$id] ?? 0,
                ],
            ])->all());

            self::syncAssignmentSchedules($project, $lines, $needsInvoice);
            self::recalculateProjectTotals($project);

            return $project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']);
        });
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     */
    private static function syncAssignmentSchedules(CleaningProject $project, array $lines, bool $needsInvoice): void
    {
        $project->loadMissing(['employees', 'schedules.dailyReport']);
        $assignments = self::employeeAssignments($project);

        foreach ($assignments as $assignment) {
            $units = (int) $assignment['assigned_units'];
            $schedule = $project->schedules->first(fn (DailySchedule $row) => (int) $row->id === (int) ($assignment['settlement_schedule_id'] ?? 0))
                ?? $project->schedules->first(fn (DailySchedule $row) => (int) $row->user_id === (int) $assignment['user_id']
                    && in_array($row->schedule_kind, [
                        CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                        CleaningProject::SCHEDULE_KIND_REGULAR,
                    ], true));

            if ($units < 1) {
                if ($schedule) {
                    if ($schedule->dailyReport) {
                        ScheduleDeletionSupport::deleteWithDependents($schedule);
                    } else {
                        $schedule->delete();
                    }
                }

                continue;
            }

            $scheduleLines = self::linesForUnits($lines, $units);
            $scheduleSummary = SchedulePricing::summarizeLines($scheduleLines, $needsInvoice);

            if (! $schedule) {
                $schedule = self::createProjectScheduleRecord(
                    $project,
                    (int) $assignment['user_id'],
                    $project->planned_start_date?->format('Y-m-d') ?? (string) $project->planned_start_date,
                    $units,
                    $lines,
                    $needsInvoice,
                    substr((string) ($project->schedules->first()?->start_time ?? '09:00'), 0, 5),
                    substr((string) ($project->schedules->first()?->end_time ?? '21:00'), 0, 5),
                    CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                );
                self::removeDuplicateSettlementSchedules($project, (int) $assignment['user_id'], (int) $schedule->id);

                continue;
            }

            $schedule->update([
                'schedule_kind' => CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                'units_allocated' => $units,
                'pricing_lines' => $scheduleLines,
                'ac_units' => $scheduleSummary['ac_units'],
                'unit_price' => $scheduleSummary['unit_price'],
                'cleaning_price' => $scheduleSummary['cleaning_price'],
                'task_details' => $scheduleSummary['task_details'],
                'needs_invoice' => $needsInvoice,
                'needs_receipt' => (bool) $project->needs_receipt,
                'needs_mail' => (bool) $project->needs_mail,
                'invoice_tax_id' => $project->invoice_tax_id,
                'invoice_title' => $project->invoice_title,
            ]);

            if ($schedule->dailyReport) {
                EmployeeReportSupport::resyncFromSchedule($schedule->dailyReport, [
                    'completed_units' => $units,
                ]);
            } else {
                ScheduleBackfillSupport::createReportIfPastBackfill($schedule);
            }

            self::removeDuplicateSettlementSchedules($project, (int) $assignment['user_id'], (int) $schedule->id);
        }
    }

    private static function removeDuplicateSettlementSchedules(
        CleaningProject $project,
        int $userId,
        int $keepScheduleId,
    ): void {
        $project->loadMissing('schedules.dailyReport');

        $project->schedules
            ->filter(fn (DailySchedule $row) => (int) $row->user_id === $userId
                && (int) $row->id !== $keepScheduleId
                && in_array($row->schedule_kind, [
                    CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                    CleaningProject::SCHEDULE_KIND_REGULAR,
                ], true))
            ->each(function (DailySchedule $duplicate) {
                ScheduleDeletionSupport::deleteWithDependents($duplicate);
            });
    }

    /**
     * @param  list<array{ac_units:int, unit_price:int}>|null  $pricingLines
     */
    public static function updateScheduleUnits(
        CleaningProject $project,
        DailySchedule $schedule,
        int $units,
        ?array $pricingLines = null,
    ): CleaningProject {
        if ((int) $schedule->cleaning_project_id !== (int) $project->id) {
            throw new \InvalidArgumentException('班表不屬於此專案');
        }

        if ($units < 1) {
            throw new \InvalidArgumentException('台數至少需 1 台');
        }

        return DB::transaction(function () use ($project, $schedule, $units, $pricingLines) {
            $needsInvoice = (bool) $project->needs_invoice;
            $lines = SchedulePricing::normalizeLines($pricingLines ?? $schedule->pricing_lines ?? $project->pricing_lines ?? []);
            $scheduleLines = self::linesForUnits($lines, $units);
            $scheduleSummary = SchedulePricing::summarizeLines($scheduleLines, $needsInvoice);

            $isSettlementSchedule = in_array($schedule->schedule_kind, [
                CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                CleaningProject::SCHEDULE_KIND_REGULAR,
            ], true);

            $schedule->update([
                'schedule_kind' => $isSettlementSchedule
                    ? CleaningProject::SCHEDULE_KIND_ASSIGNMENT
                    : $schedule->schedule_kind,
                'units_allocated' => $units,
                'pricing_lines' => $scheduleLines,
                'ac_units' => $scheduleSummary['ac_units'],
                'unit_price' => $scheduleSummary['unit_price'],
                'cleaning_price' => $scheduleSummary['cleaning_price'],
                'task_details' => $scheduleSummary['task_details'],
            ]);

            if ($isSettlementSchedule) {
                $project->employees()->updateExistingPivot((int) $schedule->user_id, [
                    'assigned_units' => $units,
                ]);
            }

            if ($schedule->dailyReport) {
                EmployeeReportSupport::resyncFromSchedule($schedule->dailyReport, [
                    'completed_units' => $units,
                ]);
            }

            self::recalculateProjectTotals($project);

            return $project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']);
        });
    }

    public static function deleteProject(CleaningProject $project): void
    {
        DB::transaction(function () use ($project) {
            $project->schedules()->orderByDesc('id')->each(function (DailySchedule $schedule) {
                ScheduleDeletionSupport::deleteWithDependents($schedule);
            });

            $project->employees()->detach();
            $project->delete();
        });
    }

    /**
     * 將舊版「逐日派班」收成「每位師傅一筆結算 + 行事曆占位」。
     *
     * @return array{
     *     project_id:int,
     *     project_code:?string,
     *     title:?string,
     *     dry_run:bool,
     *     employees:list<array{
     *         user_id:int,
     *         name:string,
     *         settlement_schedules_before:int,
     *         assigned_units:int,
     *         removed_settlement_schedules:int
     *     }>,
     *     calendar_blocks_created:int,
     *     calendar_blocks_removed:int,
     *     total_ac_units:int
     * }
     */
    public static function consolidateProjectSettlement(CleaningProject $project, bool $dryRun = false): array
    {
        $project->loadMissing(['employees', 'schedules.dailyReport', 'schedules.user']);

        $employeeIds = $project->employees->pluck('id')->map(fn ($id) => (int) $id)->all();

        if ($employeeIds === []) {
            throw new \InvalidArgumentException('專案尚未指派師傅，無法整理');
        }

        $lines = SchedulePricing::normalizeLines($project->pricing_lines ?? []);
        $needsInvoice = (bool) $project->needs_invoice;
        $assignmentTotals = self::settlementUnitsByEmployee($project);
        $assignedTotal = array_sum($assignmentTotals);

        if ($assignedTotal < 1) {
            $assignmentTotals = self::distributeUnitsAmongEmployees((int) $project->total_ac_units, $employeeIds);
            $assignedTotal = array_sum($assignmentTotals);
        }

        if ($assignedTotal < 1) {
            throw new \InvalidArgumentException('專案台數為 0，無法整理');
        }

        $employeeSummaries = [];

        foreach ($employeeIds as $employeeId) {
            $employee = $project->employees->firstWhere('id', $employeeId);
            $settlementSchedules = $project->schedules->filter(
                fn (DailySchedule $schedule) => (int) $schedule->user_id === $employeeId
                    && in_array($schedule->schedule_kind, [
                        CleaningProject::SCHEDULE_KIND_REGULAR,
                        CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
                    ], true)
            );

            $employeeSummaries[] = [
                'user_id' => $employeeId,
                'name' => $employee?->name ?? (string) $employeeId,
                'settlement_schedules_before' => $settlementSchedules->count(),
                'assigned_units' => (int) ($assignmentTotals[$employeeId] ?? 0),
                'removed_settlement_schedules' => max(0, $settlementSchedules->count() - 1),
            ];
        }

        $dates = collect(CarbonPeriod::create(
            $project->planned_start_date,
            $project->planned_end_date,
        ))->map(fn (Carbon $date) => $date->toDateString())->values();

        $calendarBlocksBefore = $project->schedules
            ->where('schedule_kind', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
            ->count();

        $expectedBlocks = max(0, max(0, $dates->count() - 1) * count($employeeIds));
        $existingBlocks = $project->schedules
            ->where('schedule_kind', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK);

        $calendarBlocksCreated = 0;
        $calendarBlocksRemoved = 0;

        foreach ($employeeIds as $employeeId) {
            foreach ($dates->skip(1) as $date) {
                $exists = $existingBlocks->contains(
                    fn (DailySchedule $schedule) => (int) $schedule->user_id === $employeeId
                        && ($schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date) === $date
                );

                if (! $exists) {
                    $calendarBlocksCreated++;
                }
            }
        }

        $legacyRegularBlocks = $project->schedules->filter(
            fn (DailySchedule $schedule) => $schedule->schedule_kind === CleaningProject::SCHEDULE_KIND_REGULAR
                && (int) $schedule->ac_units < 1
        );
        $calendarBlocksRemoved = $legacyRegularBlocks->count();

        $summary = [
            'project_id' => (int) $project->id,
            'project_code' => $project->project_code,
            'title' => $project->title,
            'dry_run' => $dryRun,
            'employees' => $employeeSummaries,
            'calendar_blocks_created' => $calendarBlocksCreated,
            'calendar_blocks_removed' => $calendarBlocksRemoved,
            'calendar_blocks_before' => $calendarBlocksBefore,
            'calendar_blocks_expected' => $expectedBlocks,
            'total_ac_units' => $assignedTotal,
        ];

        if ($dryRun) {
            return $summary;
        }

        return DB::transaction(function () use (
            $project,
            $employeeIds,
            $assignmentTotals,
            $lines,
            $needsInvoice,
            $assignedTotal,
            $summary,
            $dates,
            $legacyRegularBlocks,
        ) {
            $project->employees()->sync(collect($employeeIds)->mapWithKeys(fn ($id) => [
                $id => [
                    'role' => 'member',
                    'assigned_units' => (int) ($assignmentTotals[$id] ?? 0),
                ],
            ])->all());

            $legacyRegularBlocks->each(function (DailySchedule $schedule) {
                if ($schedule->dailyReport) {
                    ScheduleDeletionSupport::deleteWithDependents($schedule);
                } else {
                    $schedule->delete();
                }
            });

            self::syncAssignmentSchedules($project->fresh(['employees', 'schedules.dailyReport']), $lines, $needsInvoice);
            self::ensureCalendarBlocks($project->fresh(['schedules']), $employeeIds, $lines, $needsInvoice, $dates);
            self::recalculateProjectTotals($project->fresh());

            if ($project->expects_company_remittance) {
                $project = $project->fresh();
                $year = (int) $project->planned_start_date?->format('Y');
                $month = (int) $project->planned_start_date?->format('m');
                CompanyRemittanceSupport::healProjectRemittanceReports($year, $month);
                CompanyRemittanceSupport::syncForProject($project);
            }

            $summary['total_ac_units'] = (int) $project->fresh()->total_ac_units;

            return $summary;
        });
    }

    /**
     * @return array<int, int>
     */
    private static function settlementUnitsByEmployee(CleaningProject $project): array
    {
        $totals = [];

        foreach ($project->schedules as $schedule) {
            if (! in_array($schedule->schedule_kind, [
                CleaningProject::SCHEDULE_KIND_REGULAR,
                CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
            ], true)) {
                continue;
            }

            $userId = (int) $schedule->user_id;
            $totals[$userId] = ($totals[$userId] ?? 0) + (int) $schedule->ac_units;
        }

        return $totals;
    }

    /**
     * @param  list<int>  $employeeIds
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @param  \Illuminate\Support\Collection<int, string>  $dates
     */
    private static function ensureCalendarBlocks(
        CleaningProject $project,
        array $employeeIds,
        array $lines,
        bool $needsInvoice,
        $dates,
    ): int {
        if ($dates->count() < 2) {
            return 0;
        }

        $project->loadMissing('schedules');
        $created = 0;
        $startTime = substr((string) ($project->schedules->first()?->start_time ?? '09:00'), 0, 5);
        $endTime = substr((string) ($project->schedules->first()?->end_time ?? '21:00'), 0, 5);

        foreach ($employeeIds as $employeeId) {
            foreach ($dates->skip(1) as $date) {
                $exists = $project->schedules->contains(
                    fn (DailySchedule $schedule) => (int) $schedule->user_id === (int) $employeeId
                        && ($schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date) === $date
                        && $schedule->schedule_kind === CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK
                );

                if ($exists) {
                    continue;
                }

                self::createProjectScheduleRecord(
                    $project,
                    (int) $employeeId,
                    (string) $date,
                    0,
                    $lines,
                    $needsInvoice,
                    $startTime,
                    $endTime,
                    CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK,
                    autoReport: false,
                );
                $created++;
            }
        }

        return $created;
    }
}
