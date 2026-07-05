<?php

namespace App\Support;

use App\Models\DailySchedule;
use App\Models\User;
use Carbon\Carbon;

class ScheduleMutationPolicy
{
    /** @var list<string> */
    private const TIME_RESTRICTION_BYPASS_ROLES = ['admin', 'customer_service'];

    public static function canBypassTimeRestrictions(User $user): bool
    {
        return in_array($user->role, self::TIME_RESTRICTION_BYPASS_ROLES, true);
    }

    public static function canForceMutateReportedSchedule(User $user): bool
    {
        return self::canBypassTimeRestrictions($user);
    }

    public static function currentMonthStart(?Carbon $now = null): Carbon
    {
        return ($now ?? now())->copy()->startOfMonth()->startOfDay();
    }

    public static function isWorkDateInCurrentMonth(string $workDate, ?Carbon $now = null): bool
    {
        $date = Carbon::parse($workDate)->startOfDay();
        $start = self::currentMonthStart($now);
        $end = ($now ?? now())->copy()->endOfMonth()->endOfDay();

        return $date->gte($start) && $date->lte($end);
    }

    public static function isWorkDateBeforeCurrentMonth(string $workDate, ?Carbon $now = null): bool
    {
        return Carbon::parse($workDate)->startOfDay()->lt(self::currentMonthStart($now));
    }

    public static function canMutateSchedule(User $user, string $workDate, ?DailySchedule $existing = null): ?string
    {
        if ($existing) {
            $existingDate = $existing->work_date?->format('Y-m-d') ?? (string) $existing->work_date;

            if (self::isWorkDateBeforeCurrentMonth($existingDate) && ! self::canBypassTimeRestrictions($user)) {
                return '已跨月的班表僅管理員或客服可修改';
            }
        }

        if (self::isWorkDateBeforeCurrentMonth($workDate) && ! self::canBypassTimeRestrictions($user)) {
            return '僅能調整當月班表，跨月後請由管理員或客服修改';
        }

        return null;
    }

    public static function validateScheduleTiming(
        string $workDate,
        string $startTime,
        ?DailySchedule $existing = null,
        ?Carbon $now = null
    ): ?string {
        $now ??= now();

        if ($existing) {
            $existingDate = $existing->work_date?->format('Y-m-d') ?? (string) $existing->work_date;
            $existingStart = substr((string) $existing->start_time, 0, 5);

            if ($workDate === $existingDate && $startTime === $existingStart) {
                return null;
            }
        }

        if (self::isWorkDateInCurrentMonth($workDate, $now)) {
            return null;
        }

        if (self::isWorkDateBeforeCurrentMonth($workDate, $now)) {
            return null;
        }

        $scheduledAt = Carbon::parse($workDate.' '.$startTime);

        if ($scheduledAt->lt($now)) {
            return '不可預約過去的日期或時間，請選擇現在之後的時段';
        }

        return null;
    }
}
