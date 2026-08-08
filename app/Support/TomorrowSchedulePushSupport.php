<?php

namespace App\Support;

use App\Models\CleaningProject;
use App\Models\DailySchedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class TomorrowSchedulePushSupport
{
    /**
     * @return array{
     *   date: string,
     *   recipients: int,
     *   sent: int,
     *   failed: int,
     *   skipped: int,
     *   details: list<array<string, mixed>>
     * }
     */
    public static function send(?Carbon $day = null, bool $dryRun = false): array
    {
        $day = ($day ?? Carbon::tomorrow())->startOfDay();
        $date = $day->toDateString();

        $employees = User::query()
            ->where('role', 'employee')
            ->where('is_active', true)
            ->whereNotNull('line_user_id')
            ->where('line_user_id', '!=', '')
            ->orderBy('id')
            ->get(['id', 'name', 'line_user_id']);

        $schedulesByUser = DailySchedule::query()
            ->whereDate('work_date', $date)
            ->where('schedule_kind', '!=', CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK)
            ->whereIn('user_id', $employees->pluck('id'))
            ->orderBy('start_time')
            ->orderBy('id')
            ->get()
            ->groupBy('user_id');

        $sent = 0;
        $failed = 0;
        $skipped = 0;
        $details = [];

        foreach ($employees as $employee) {
            /** @var Collection<int, DailySchedule> $schedules */
            $schedules = $schedulesByUser->get($employee->id, collect());

            if ($schedules->isEmpty()) {
                $skipped++;
                $details[] = [
                    'user_id' => $employee->id,
                    'name' => $employee->name,
                    'status' => 'skipped_no_schedules',
                    'schedule_count' => 0,
                ];
                continue;
            }

            $message = self::buildMessage($employee->name, $date, $schedules);

            if ($dryRun) {
                $sent++;
                $details[] = [
                    'user_id' => $employee->id,
                    'name' => $employee->name,
                    'status' => 'dry_run',
                    'schedule_count' => $schedules->count(),
                    'message_preview' => mb_substr($message, 0, 120),
                ];
                continue;
            }

            $ok = LinePushSupport::pushText((string) $employee->line_user_id, $message);

            if ($ok) {
                $sent++;
                $details[] = [
                    'user_id' => $employee->id,
                    'name' => $employee->name,
                    'status' => 'sent',
                    'schedule_count' => $schedules->count(),
                ];
            } else {
                $failed++;
                $details[] = [
                    'user_id' => $employee->id,
                    'name' => $employee->name,
                    'status' => 'failed',
                    'schedule_count' => $schedules->count(),
                ];
            }
        }

        return [
            'date' => $date,
            'recipients' => $employees->count(),
            'sent' => $sent,
            'failed' => $failed,
            'skipped' => $skipped,
            'details' => $details,
        ];
    }

    /**
     * @param  Collection<int, DailySchedule>  $schedules
     */
    public static function buildMessage(string $employeeName, string $date, Collection $schedules): string
    {
        $totalReceivable = (int) $schedules->sum(fn (DailySchedule $schedule) => max(0, (int) ($schedule->cleaning_price ?? 0)));

        $lines = [
            "📅 明日班表提醒 ({$date})",
            "👨‍🔧 師傅：{$employeeName}",
            '共有 '.$schedules->count().' 件行程',
            '💵 明日應收合計：'.self::formatMoney($totalReceivable).' 元',
        ];

        foreach ($schedules as $schedule) {
            $address = trim((string) ($schedule->customer_address ?? ''));
            $mapsUrl = $address !== ''
                ? 'https://www.google.com/maps/search/?api=1&query='.rawurlencode($address)
                : '（無地址）';
            $amount = max(0, (int) ($schedule->cleaning_price ?? 0));

            $lines[] = '----------------------';
            $lines[] = '⏰ '.self::formatTime($schedule->start_time).' - '.self::formatTime($schedule->end_time);
            $lines[] = '👤 客戶：'.(trim((string) ($schedule->customer_name ?? '')) ?: '-');
            $lines[] = '📞 電話：'.(trim((string) ($schedule->customer_phone ?? '')) ?: '-');
            $lines[] = '📍 地址：'.($address !== '' ? $address : '-');
            $lines[] = '💰 應收：'.self::formatMoney($amount).' 元';
            $lines[] = '🗺️ 導航：'.$mapsUrl;
        }

        $lines[] = '----------------------';

        return implode("\n", $lines);
    }

    private static function formatMoney(int $amount): string
    {
        return number_format($amount, 0, '.', ',');
    }

    private static function formatTime(mixed $time): string
    {
        if ($time instanceof Carbon) {
            return $time->format('H:i');
        }

        $value = trim((string) $time);

        if ($value === '') {
            return '--:--';
        }

        return substr($value, 0, 5);
    }
}
