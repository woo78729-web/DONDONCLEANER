<?php

namespace App\Support;

use App\Models\CompanyRemittance;
use App\Models\DailySchedule;
use App\Models\ScheduleAnnouncementEvent;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class ScheduleDeletionSupport
{
    public static function deleteWithDependents(DailySchedule $schedule, ?User $actor = null): void
    {
        $actor ??= Auth::user();
        self::recordCancelAnnouncement($schedule, $actor);

        $report = $schedule->dailyReport;

        if ($report) {
            CompanyRemittance::query()->where('report_id', $report->id)->delete();
            $report->delete();
        }

        $schedule->delete();
    }

    private static function recordCancelAnnouncement(DailySchedule $schedule, ?User $actor): void
    {
        $schedule->loadMissing('user:id,name');

        $source = (string) ($schedule->customer_source ?: CustomerSource::PHONE);
        $contactName = match (true) {
            $source === CustomerSource::LINE => $schedule->line_display_name ?: ($schedule->customer_name ?: '未填名稱'),
            CustomerSource::isFacebookFamily($source) => $schedule->fb_display_name ?: ($schedule->customer_name ?: '未填名稱'),
            default => $schedule->customer_name ?: '未填名稱',
        };

        ScheduleAnnouncementEvent::query()->create([
            'event_type' => ScheduleAnnouncementEvent::TYPE_CANCEL,
            'schedule_id' => $schedule->id,
            'actor_user_id' => $actor?->id,
            'technician_name' => $schedule->user?->name ?: '未指定師傅',
            'customer_source' => $source,
            'contact_name' => $contactName,
            'service_area' => $schedule->service_area,
            'ac_units' => (int) $schedule->ac_units,
            'work_date' => $schedule->work_date?->format('Y-m-d'),
        ]);
    }
}
