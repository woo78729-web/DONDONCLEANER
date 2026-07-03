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
            $needsInvoice = (bool) ($payload['needs_invoice'] ?? false);
            $lines = SchedulePricing::normalizeLines($payload['pricing_lines'] ?? null);
            $summary = SchedulePricing::summarizeLines($lines, $needsInvoice);

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
                'needs_mail' => (bool) ($payload['needs_mail'] ?? false),
                'mail_recipient' => $payload['mail_recipient'] ?? null,
                'mail_phone' => $payload['mail_phone'] ?? null,
                'mail_address' => $payload['mail_address'] ?? null,
                'invoice_tax_id' => $payload['invoice_tax_id'] ?? null,
                'invoice_title' => $payload['invoice_title'] ?? null,
                'planned_start_date' => $startDate->toDateString(),
                'planned_end_date' => $endDate->toDateString(),
                'notes' => $payload['notes'] ?? null,
            ]);

            $project->employees()->sync(collect($employeeIds)->mapWithKeys(fn ($id) => [
                (int) $id => ['role' => 'member'],
            ])->all());

            self::generateProjectSchedules(
                $project,
                $employeeIds,
                $lines,
                $needsInvoice,
                $payload['start_time'] ?? '09:00',
                $payload['end_time'] ?? '17:00',
            );

            return $project->fresh(['employees', 'schedules.user', 'schedules.dailyReport']);
        });
    }

    /**
     * @param  list<int>  $employeeIds
     * @param  list<array{ac_units:int, unit_price:int}>  $lines
     * @param  list<int>  $employeeIds
     */
    public static function generateProjectSchedules(
        CleaningProject $project,
        array $employeeIds,
        array $lines,
        bool $needsInvoice,
        string $startTime = '09:00',
        string $endTime = '17:00',
        string $scheduleKind = CleaningProject::SCHEDULE_KIND_REGULAR,
    ): void {
        $dates = collect(CarbonPeriod::create(
            $project->planned_start_date,
            $project->planned_end_date,
        ))->map(fn (Carbon $date) => $date->toDateString())->values();

        if ($dates->isEmpty() || $employeeIds === []) {
            return;
        }

        $slotCount = $dates->count() * count($employeeIds);
        $totalUnits = (int) $project->total_ac_units;
        $baseUnits = intdiv($totalUnits, max(1, $slotCount));
        $remainder = $totalUnits % max(1, $slotCount);
        $slotIndex = 0;

        foreach ($dates as $date) {
            foreach ($employeeIds as $employeeId) {
                $units = $baseUnits + ($slotIndex < $remainder ? 1 : 0);
                $slotIndex++;

                if ($units < 1) {
                    continue;
                }

                $scheduleLines = self::linesForUnits($lines, $units);
                $summary = SchedulePricing::summarizeLines($scheduleLines, $needsInvoice);

                DailySchedule::query()->create([
                    'cleaning_project_id' => $project->id,
                    'schedule_kind' => $scheduleKind,
                    'user_id' => (int) $employeeId,
                    'work_date' => $date,
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
                    'invoice_tax_id' => $project->invoice_tax_id,
                    'invoice_title' => $project->invoice_title,
                    'notes' => $project->notes,
                ]);
            }
        }
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
                'invoice_tax_id' => $project->invoice_tax_id,
                'invoice_title' => $project->invoice_title,
                'notes' => $payload['notes'] ?? '補台數',
            ]);

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
        $schedules = $project->schedules()->with('dailyReport')->get();
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
            'needs_mail' => (bool) $project->needs_mail,
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
            ])->values(),
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
}
