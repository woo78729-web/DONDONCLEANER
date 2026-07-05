<?php

namespace App\Support;

use App\Models\DailySchedule;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class EmployeeScheduleSupport
{
    public static function scheduleRelations(): array
    {
        return [
            'user:id,name,account,role,is_active,avatar_path',
            'dailyReport',
            'cleaningProject:id,project_code,title,status,planned_start_date,planned_end_date,total_ac_units',
        ];
    }

    public static function isOverdueUnreported(DailySchedule $schedule, ?Carbon $now = null): bool
    {
        if ($schedule->dailyReport) {
            return false;
        }

        $now ??= now();
        $workDate = self::workDateString($schedule);

        if ($workDate < $now->toDateString()) {
            return true;
        }

        if ($workDate === $now->toDateString()) {
            return $now->greaterThan(self::scheduleEndDateTime($schedule));
        }

        return false;
    }

    public static function overdueUnreportedQuery(int $userId, ?Carbon $now = null): Builder
    {
        $now ??= now();
        $today = $now->toDateString();
        $currentTime = $now->format('H:i');

        return DailySchedule::query()
            ->with(self::scheduleRelations())
            ->where('user_id', $userId)
            ->whereDoesntHave('dailyReport')
            ->where(function (Builder $builder) use ($today, $currentTime) {
                $builder
                    ->whereDate('work_date', '<', $today)
                    ->orWhere(function (Builder $todayBuilder) use ($today, $currentTime) {
                        $todayBuilder
                            ->whereDate('work_date', $today)
                            ->where('end_time', '<=', $currentTime);
                    });
            });
    }

    /**
     * @return Collection<int, DailySchedule>
     */
    public static function overdueUnreportedSchedules(int $userId, ?Carbon $now = null): Collection
    {
        $now ??= now();

        return self::overdueUnreportedQuery($userId, $now)
            ->orderBy('work_date')
            ->orderBy('start_time')
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  Collection<int, DailySchedule>  $schedules
     * @return Collection<int, DailySchedule>
     */
    public static function pinOverdueUnreported(Collection $schedules, ?Carbon $now = null): Collection
    {
        $now ??= now();

        $overdue = $schedules
            ->filter(fn (DailySchedule $schedule) => self::isOverdueUnreported($schedule, $now))
            ->sortBy(fn (DailySchedule $schedule) => sprintf(
                '%s-%s-%06d',
                self::workDateString($schedule),
                self::formatTimeValue($schedule->start_time),
                $schedule->id,
            ))
            ->values();

        $rest = $schedules
            ->reject(fn (DailySchedule $schedule) => self::isOverdueUnreported($schedule, $now))
            ->sortBy(fn (DailySchedule $schedule) => sprintf(
                '%s-%s-%06d',
                self::workDateString($schedule),
                self::formatTimeValue($schedule->start_time),
                $schedule->id,
            ))
            ->values();

        return $overdue->concat($rest)->values();
    }

    /**
     * @param  Collection<int, DailySchedule>  $schedules
     * @return Collection<int, DailySchedule>
     */
    public static function annotateOverdueUnreported(Collection $schedules, ?Carbon $now = null): Collection
    {
        $now ??= now();

        return $schedules->map(function (DailySchedule $schedule) use ($now) {
            $schedule->setAttribute(
                'is_overdue_unreported',
                self::isOverdueUnreported($schedule, $now),
            );

            return $schedule;
        })->values();
    }

    public static function countOverdueUnreported(Collection $schedules, ?Carbon $now = null): int
    {
        $now ??= now();

        return $schedules
            ->filter(fn (DailySchedule $schedule) => self::isOverdueUnreported($schedule, $now))
            ->count();
    }

    /**
     * @return Collection<int, DailySchedule>
     */
    public static function overduePastUnreportedSchedules(int $userId, ?Carbon $now = null): Collection
    {
        $now ??= now();
        $today = $now->toDateString();

        return self::overdueUnreportedSchedules($userId, $now)
            ->filter(fn (DailySchedule $schedule) => self::workDateString($schedule) < $today)
            ->values();
    }

    public static function workDateString(DailySchedule $schedule): string
    {
        $workDate = $schedule->work_date;

        if ($workDate instanceof Carbon) {
            return $workDate->toDateString();
        }

        return (string) $workDate;
    }

    private static function scheduleEndDateTime(DailySchedule $schedule): Carbon
    {
        return Carbon::parse(sprintf(
            '%s %s',
            self::workDateString($schedule),
            self::formatTimeValue($schedule->end_time),
        ));
    }

    private static function formatTimeValue(mixed $time): string
    {
        if ($time instanceof Carbon) {
            return $time->format('H:i');
        }

        $value = trim((string) $time);

        if ($value === '') {
            return '00:00';
        }

        return substr($value, 0, 5);
    }
}
