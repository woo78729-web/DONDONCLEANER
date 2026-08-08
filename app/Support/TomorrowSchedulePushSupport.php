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
        $totalReceivable = (int) $schedules->sum(
            fn (DailySchedule $schedule) => self::resolveReceivableAmount($schedule),
        );

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
            $amount = self::resolveReceivableAmount($schedule);

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

    /**
     * 推播應收優先用本站 pricing_lines（多地址各自收款）。
     * 舊資料若把總額掛在第一站、其餘為 0，再依多址備註按台數比例分攤。
     */
    private static function resolveReceivableAmount(DailySchedule $schedule): int
    {
        $pricingLines = $schedule->pricing_lines;

        if (is_array($pricingLines) && $pricingLines !== []) {
            $fromLines = (int) SchedulePricing::summarizeLines($pricingLines, false)['cleaning_price'];

            if ($fromLines > 0) {
                return $fromLines;
            }
        }

        $stored = max(0, (int) ($schedule->cleaning_price ?? 0));
        $multi = MailTrackingSupport::parseMultiAddressPart($schedule);
        $groupPrice = $multi['group_price'] ?? null;
        $groupUnits = $multi['group_units'] ?? null;

        if ($stored > 0) {
            if (
                $multi
                && ($multi['index'] ?? null) === 1
                && $groupPrice !== null
                && $stored === $groupPrice
            ) {
                $proportional = self::proportionalMultiAddressAmount($schedule, $groupUnits, $groupPrice);

                if ($proportional > 0) {
                    return $proportional;
                }
            }

            return $stored;
        }

        $proportional = self::proportionalMultiAddressAmount($schedule, $groupUnits, $groupPrice);

        if ($proportional > 0) {
            return $proportional;
        }

        return 0;
    }

    private static function proportionalMultiAddressAmount(
        DailySchedule $schedule,
        ?int $groupUnits,
        ?int $groupPrice,
    ): int {
        if ($groupUnits === null || $groupPrice === null || $groupUnits <= 0) {
            return 0;
        }

        $units = (int) ($schedule->ac_units ?? 0);

        if ($units <= 0 && is_array($schedule->pricing_lines) && $schedule->pricing_lines !== []) {
            $units = (int) SchedulePricing::summarizeLines($schedule->pricing_lines, false)['ac_units'];
        }

        if ($units <= 0) {
            return 0;
        }

        return (int) round(($groupPrice * $units) / $groupUnits);
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
