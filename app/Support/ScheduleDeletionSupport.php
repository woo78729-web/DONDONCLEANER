<?php

namespace App\Support;

use App\Models\CompanyRemittance;
use App\Models\DailySchedule;

class ScheduleDeletionSupport
{
    public static function deleteWithDependents(DailySchedule $schedule): void
    {
        $report = $schedule->dailyReport;

        if ($report) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();
            $report->delete();
        }

        $schedule->delete();
    }
}
