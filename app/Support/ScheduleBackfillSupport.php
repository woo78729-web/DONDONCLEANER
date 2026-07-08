<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use Carbon\Carbon;

class ScheduleBackfillSupport
{
    public static function requiresTechnicianReport(DailySchedule $schedule): bool
    {
        if ($schedule->schedule_kind === \App\Models\CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK) {
            return false;
        }

        return (int) $schedule->ac_units >= 1;
    }

    public static function isStrictlyPastWorkDate(string $workDate, ?Carbon $now = null): bool
    {
        return Carbon::parse($workDate)->startOfDay()->lt(($now ?? now())->copy()->startOfDay());
    }

    public static function shouldAutoReport(DailySchedule $schedule, ?Carbon $now = null): bool
    {
        if ($schedule->dailyReport()->exists()) {
            return false;
        }

        if (! self::requiresTechnicianReport($schedule)) {
            return false;
        }

        $workDate = $schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date;

        return self::isStrictlyPastWorkDate($workDate, $now);
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildAutoReportInput(DailySchedule $schedule): array
    {
        $schedule->loadMissing('cleaningProject');
        $needsInvoice = (bool) $schedule->needs_invoice;
        $needsReceipt = (bool) $schedule->needs_receipt;
        $needsMail = (bool) $schedule->needs_mail;
        $paidToCompany = (bool) ($schedule->cleaningProject?->expects_company_remittance ?? false);

        return [
            'completed_units' => (int) $schedule->ac_units,
            'has_tax' => $needsInvoice,
            'needs_invoice_and_mail' => $needsInvoice,
            'needs_receipt_and_mail' => $needsReceipt || ($needsMail && ! $needsInvoice),
            'paid_to_company' => $paidToCompany,
            'travel_allowance' => 0,
        ];
    }

    public static function createReportIfPastBackfill(DailySchedule $schedule, ?Carbon $now = null): ?DailyReport
    {
        if (! self::shouldAutoReport($schedule, $now)) {
            return null;
        }

        return EmployeeReportSupport::createFromSchedule(
            $schedule,
            self::buildAutoReportInput($schedule)
        );
    }

    /**
     * 補跑過去日期、尚未回報且應自動回報的班表（例如早期補單漏跑）。
     *
     * @return array{matched:int, created:int, dry_run:bool}
     */
    public static function backfillMissingReports(
        ?int $userId = null,
        ?string $yearMonth = null,
        bool $dryRun = false,
        ?Carbon $now = null,
    ): array {
        $query = DailySchedule::query()
            ->whereDoesntHave('dailyReport')
            ->where('schedule_kind', '!=', \App\Models\CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
            ->where('ac_units', '>=', 1);

        if ($userId !== null) {
            $query->where('user_id', $userId);
        }

        if ($yearMonth !== null) {
            [$year, $month] = array_pad(explode('-', $yearMonth), 2, null);

            if ($year && $month) {
                $query
                    ->whereYear('work_date', (int) $year)
                    ->whereMonth('work_date', (int) $month);
            }
        }

        $matched = 0;
        $created = 0;

        foreach ($query->orderBy('work_date')->orderBy('id')->get() as $schedule) {
            if (! self::shouldAutoReport($schedule, $now)) {
                continue;
            }

            $matched++;

            if ($dryRun) {
                continue;
            }

            if (self::createReportIfPastBackfill($schedule, $now) !== null) {
                $created++;
            }
        }

        return [
            'matched' => $matched,
            'created' => $created,
            'dry_run' => $dryRun,
        ];
    }
}
