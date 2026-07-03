<?php

namespace App\Support;

use App\Models\DailySchedule;
use App\Models\EmployeeLeave;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class SchedulePlanningSupport
{
    public const LEAVE_WINDOW_START_DAY = 20;

    public const LEAVE_WINDOW_END_DAY = 25;

    public const NEW_EMPLOYEE_LEAVE_DAYS = 3;

    public const WORKDAY_START = '07:00';

    public const WORKDAY_END = '21:00';

    public const AFTERNOON_START = '12:00';

    public static function isLeaveRegistrationOpen(?Carbon $now = null): bool
    {
        $now ??= now();
        $day = (int) $now->day;

        return $day >= self::LEAVE_WINDOW_START_DAY && $day <= self::LEAVE_WINDOW_END_DAY;
    }

    public static function leaveRegistrationMessage(?Carbon $now = null): string
    {
        if (self::isLeaveRegistrationOpen($now)) {
            return '目前開放排假，可勾選日期或設定每週固定休息日。';
        }

        return '排假開放時間為每月 '.self::LEAVE_WINDOW_START_DAY.'–'.self::LEAVE_WINDOW_END_DAY.' 日；新人加入後另有 '.self::NEW_EMPLOYEE_LEAVE_DAYS.' 天可登記當月假。';
    }

    /**
     * @return array{
     *     registration_open: bool,
     *     registration_message: string,
     *     allowed_months: array<int, string>,
     *     default_month: string,
     *     is_new_employee_window: bool
     * }
     */
    public static function employeeLeaveRegistration(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        $createdAt = Carbon::parse($user->created_at ?? $now)->startOfDay();
        $today = $now->copy()->startOfDay();
        $daysSinceJoin = (int) $createdAt->diffInDays($today);
        $inNewEmployeeWindow = $daysSinceJoin < self::NEW_EMPLOYEE_LEAVE_DAYS;
        $joinedAfter25 = (int) $createdAt->day > self::LEAVE_WINDOW_END_DAY;
        $regularOpen = self::isLeaveRegistrationOpen($now);

        $allowedMonths = [];
        $registrationOpen = false;
        $message = '';

        if ($inNewEmployeeWindow) {
            $registrationOpen = true;
            $allowedMonths[] = $now->format('Y-m');

            if ($joinedAfter25) {
                $allowedMonths[] = $now->copy()->addMonth()->format('Y-m');
            }

            $remainingDays = self::NEW_EMPLOYEE_LEAVE_DAYS - $daysSinceJoin;
            $message = '新人排假開放中：可登記當月休假';

            if ($joinedAfter25) {
                $message .= '及下個月';
            }

            $message .= "（剩餘 {$remainingDays} 天可登記）";
        } elseif ($regularOpen) {
            $registrationOpen = true;
            $allowedMonths[] = $now->copy()->addMonth()->format('Y-m');
            $message = '目前開放登記下個月排假，請在月曆複選日期後按確認。';
        } else {
            $message = self::leaveRegistrationMessage($now);
        }

        $defaultMonth = $allowedMonths[0] ?? $now->copy()->addMonth()->format('Y-m');

        return [
            'registration_open' => $registrationOpen,
            'registration_message' => $message,
            'allowed_months' => array_values(array_unique($allowedMonths)),
            'default_month' => $defaultMonth,
            'is_new_employee_window' => $inNewEmployeeWindow,
        ];
    }

    public static function canEmployeeRegisterLeave(User $user, ?Carbon $now = null): bool
    {
        return self::employeeLeaveRegistration($user, $now)['registration_open'];
    }

    public static function isLeaveDateAllowedForEmployee(User $user, string $leaveDate, ?Carbon $now = null): bool
    {
        $context = self::employeeLeaveRegistration($user, $now);

        if (! $context['registration_open']) {
            return false;
        }

        $month = Carbon::parse($leaveDate)->format('Y-m');

        return in_array($month, $context['allowed_months'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public static function leavePayload(EmployeeLeave $leave): array
    {
        return [
            'id' => $leave->id,
            'user_id' => $leave->user_id,
            'leave_type' => $leave->leave_type,
            'leave_date' => $leave->leave_date?->format('Y-m-d'),
            'weekday' => $leave->weekday,
            'weekday_label' => $leave->weekday !== null
                ? self::weekdayLabel((int) $leave->weekday)
                : null,
            'note' => $leave->note,
            'user' => $leave->user ? [
                'id' => $leave->user->id,
                'name' => $leave->user->name,
                'account' => $leave->user->account,
            ] : null,
        ];
    }

    public static function weekdayLabel(int $weekday): string
    {
        return ['日', '一', '二', '三', '四', '五', '六'][$weekday] ?? (string) $weekday;
    }

    public static function isOnLeave(Collection $leaves, int $userId, string $date): bool
    {
        $carbon = Carbon::parse($date);

        return $leaves->contains(function (EmployeeLeave $leave) use ($userId, $carbon) {
            if ((int) $leave->user_id !== $userId) {
                return false;
            }

            if ($leave->leave_type === EmployeeLeave::TYPE_DATE) {
                return $leave->leave_date?->format('Y-m-d') === $carbon->format('Y-m-d');
            }

            if ($leave->leave_type === EmployeeLeave::TYPE_WEEKLY) {
                return (int) $leave->weekday === (int) $carbon->dayOfWeek;
            }

            return false;
        });
    }

    public static function hasScheduleOnDate(int $userId, string $date): bool
    {
        return DailySchedule::query()
            ->where('user_id', $userId)
            ->whereDate('work_date', $date)
            ->exists();
    }

    /**
     * @param  array<int, string>  $areas
     * @return array<string, mixed>
     */
    public static function buildAvailability(
        Collection $employees,
        Collection $schedules,
        Collection $leaves,
        array $areas,
        int $days = 14,
    ): array {
        $start = now()->startOfDay();
        $areaFilter = array_values(array_filter($areas));

        $dayRows = [];

        for ($offset = 0; $offset < $days; $offset += 1) {
            $date = $start->copy()->addDays($offset);
            $dateKey = $date->format('Y-m-d');
            $employeeRows = [];

            foreach ($employees as $employee) {
                $onLeave = self::isOnLeave($leaves, (int) $employee->id, $dateKey);

                if ($onLeave) {
                    $employeeRows[] = [
                        'id' => $employee->id,
                        'name' => $employee->name,
                        'account' => $employee->account,
                        'on_leave' => true,
                        'jobs' => [],
                        'open_slots' => [],
                    ];

                    continue;
                }

                $allDayJobs = $schedules
                    ->filter(fn (DailySchedule $schedule) => (int) $schedule->user_id === (int) $employee->id
                        && $schedule->work_date?->format('Y-m-d') === $dateKey)
                    ->sortBy('start_time')
                    ->values();

                $displayJobs = $areaFilter === []
                    ? $allDayJobs
                    : $allDayJobs->filter(function (DailySchedule $schedule) use ($areaFilter) {
                        $area = $schedule->service_area ?: 'unknown';

                        return in_array($area, $areaFilter, true);
                    });

                $mapJob = fn (DailySchedule $schedule) => [
                    'id' => $schedule->id,
                    'start_time' => self::formatTime($schedule->start_time),
                    'end_time' => self::formatTime($schedule->end_time),
                    'service_area' => $schedule->service_area,
                    'service_area_label' => TaitungServiceArea::label($schedule->service_area),
                    'ac_units' => $schedule->ac_units,
                    'cleaning_price' => $schedule->cleaning_price,
                    'customer_name' => $schedule->customer_name,
                    'customer_source' => $schedule->customer_source,
                ];

                $dayJobs = $displayJobs->map($mapJob)->all();
                $allJobsPayload = $allDayJobs->map($mapJob)->all();

                $employeeRows[] = [
                    'id' => $employee->id,
                    'name' => $employee->name,
                    'account' => $employee->account,
                    'on_leave' => false,
                    'jobs' => $dayJobs,
                    'open_slots' => self::openSlotsForJobs($allJobsPayload),
                ];
            }

            $dayRows[] = [
                'date' => $dateKey,
                'weekday' => self::weekdayLabel((int) $date->dayOfWeek),
                'employees' => $employeeRows,
            ];
        }

        return [
            'days' => $dayRows,
            'areas' => $areaFilter,
            'days_count' => $days,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $jobs
     * @return array<int, array<string, string>>
     */
    private static function openSlotsForJobs(array $jobs): array
    {
        if ($jobs === []) {
            return [[
                'period' => 'full',
                'label' => '全日可排',
                'from' => self::WORKDAY_START,
                'to' => self::WORKDAY_END,
            ]];
        }

        $slots = [];
        $sorted = collect($jobs)->sortBy('start_time')->values();
        $firstStart = $sorted->first()['start_time'] ?? self::WORKDAY_START;

        if (self::timeToMinutes($firstStart) > self::timeToMinutes(self::WORKDAY_START) + 30) {
            $slots[] = [
                'period' => 'morning',
                'label' => '上午可排',
                'from' => self::WORKDAY_START,
                'to' => $firstStart,
            ];
        }

        $lastEnd = $sorted->last()['end_time'] ?? self::WORKDAY_END;
        $afternoonStartMinutes = self::timeToMinutes(self::AFTERNOON_START);
        $lastEndMinutes = self::timeToMinutes($lastEnd);

        if ($lastEndMinutes < self::timeToMinutes(self::WORKDAY_END) - 30) {
            $from = $lastEndMinutes >= $afternoonStartMinutes ? $lastEnd : self::AFTERNOON_START;
            $slots[] = [
                'period' => 'afternoon',
                'label' => '下午可排',
                'from' => $from,
                'to' => self::WORKDAY_END,
            ];
        }

        return $slots;
    }

    private static function formatTime(mixed $value): string
    {
        if ($value === null) {
            return '09:00';
        }

        return substr((string) $value, 0, 5);
    }

    private static function timeToMinutes(string $time): int
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return ($hour * 60) + $minute;
    }
}
