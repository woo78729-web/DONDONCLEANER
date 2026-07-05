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

        $workDate = $schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date;

        return self::isStrictlyPastWorkDate($workDate, $now);
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildAutoReportInput(DailySchedule $schedule): array
    {
        return [
            'completed_units' => (int) $schedule->ac_units,
            'has_tax' => (bool) $schedule->needs_invoice,
            'needs_invoice_and_mail' => false,
            'needs_receipt_and_mail' => (bool) $schedule->needs_mail,
            'paid_to_company' => false,
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
