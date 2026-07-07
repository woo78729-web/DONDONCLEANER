<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use Carbon\Carbon;

class ScheduleBackfillSupport
{
    public static function isStrictlyPastWorkDate(string $workDate, ?Carbon $now = null): bool
    {
        return Carbon::parse($workDate)->startOfDay()->lt(($now ?? now())->copy()->startOfDay());
    }

    public static function shouldAutoReport(DailySchedule $schedule, ?Carbon $now = null): bool
    {
        if ($schedule->dailyReport()->exists()) {
            return false;
        }

        if ($schedule->schedule_kind === \App\Models\CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK) {
            return false;
        }

        if ((int) $schedule->ac_units < 1) {
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
}
