<?php

namespace App\Support;

use App\Models\DailySchedule;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MailMergeSupport
{
    /**
     * @param  list<int>  $scheduleIds
     */
    public static function mergeSchedules(array $scheduleIds): string
    {
        return DB::transaction(function () use ($scheduleIds) {
            $schedules = DailySchedule::query()
                ->whereIn('id', $scheduleIds)
                ->with('dailyReport')
                ->orderBy('work_date')
                ->orderBy('id')
                ->get();

            if ($schedules->count() < 2) {
                throw new \InvalidArgumentException('請至少選擇兩筆待寄項目');
            }

            self::assertMergeable($schedules);

            $previousGroupIds = $schedules
                ->pluck('mail_merge_group_id')
                ->filter()
                ->unique()
                ->values()
                ->all();

            $groupId = (string) Str::uuid();

            foreach ($schedules as $schedule) {
                $schedule->mail_merge_group_id = $groupId;
                $schedule->save();
            }

            self::syncGroupPostage($groupId);

            foreach ($previousGroupIds as $previousGroupId) {
                if ($previousGroupId !== $groupId) {
                    self::cleanupGroup($previousGroupId);
                }
            }

            return $groupId;
        });
    }

    /**
     * @param  list<int>  $scheduleIds
     */
    public static function unmergeSchedules(array $scheduleIds): void
    {
        DB::transaction(function () use ($scheduleIds) {
            $schedules = DailySchedule::query()
                ->whereIn('id', $scheduleIds)
                ->with('dailyReport')
                ->get();

            if ($schedules->isEmpty()) {
                throw new \InvalidArgumentException('找不到可取消合併的班表');
            }

            $affectedGroupIds = $schedules
                ->pluck('mail_merge_group_id')
                ->filter()
                ->unique()
                ->values()
                ->all();

            foreach ($schedules as $schedule) {
                $schedule->mail_merge_group_id = null;
                $schedule->save();
                self::resyncSchedulePostage($schedule);
            }

            foreach ($affectedGroupIds as $groupId) {
                self::cleanupGroup($groupId);
            }
        });
    }

    public static function syncGroupPostage(string $groupId): void
    {
        $schedules = DailySchedule::query()
            ->where('mail_merge_group_id', $groupId)
            ->orderBy('work_date')
            ->orderBy('id')
            ->with('dailyReport')
            ->get();

        if ($schedules->count() < 2) {
            return;
        }

        $primaryScheduleId = $schedules->first()?->id;

        foreach ($schedules as $schedule) {
            $report = $schedule->dailyReport;

            if (! $report) {
                continue;
            }

            $needsMail = (bool) $report->needs_invoice_and_mail || (bool) $report->needs_receipt_and_mail;

            if (! $needsMail) {
                continue;
            }

            $postage = $schedule->id === $primaryScheduleId
                ? EmployeeReportSupport::POSTAGE_AMOUNT
                : 0;

            if ((int) $report->temporary_postage !== $postage) {
                $report->temporary_postage = $postage;
                $report->save();
            }
        }
    }

    public static function resyncSchedulePostage(DailySchedule $schedule): void
    {
        $report = $schedule->dailyReport;

        if (! $report) {
            return;
        }

        $needsMail = (bool) $report->needs_invoice_and_mail || (bool) $report->needs_receipt_and_mail;
        $postage = MailRecipientSupport::postageAmountFor($schedule, $needsMail, $report->id);

        if ((int) $report->temporary_postage !== $postage) {
            $report->temporary_postage = $postage;
            $report->save();
        }
    }

    public static function accountingPostageKey(DailySchedule $schedule): string
    {
        if ($schedule->mail_merge_group_id) {
            return 'merge:'.$schedule->mail_merge_group_id;
        }

        return MailRecipientSupport::customerPostageKey($schedule);
    }

    public static function cleanupGroup(string $groupId): void
    {
        $remaining = DailySchedule::query()
            ->where('mail_merge_group_id', $groupId)
            ->with('dailyReport')
            ->orderBy('work_date')
            ->orderBy('id')
            ->get();

        if ($remaining->count() <= 1) {
            foreach ($remaining as $schedule) {
                $schedule->mail_merge_group_id = null;
                $schedule->save();
                self::resyncSchedulePostage($schedule);
            }

            return;
        }

        self::syncGroupPostage($groupId);
    }

    /**
     * @param  Collection<int, DailySchedule>  $schedules
     */
    private static function assertMergeable(Collection $schedules): void
    {
        $phones = $schedules
            ->map(fn (DailySchedule $schedule) => MailRecipientSupport::normalizedCustomerPhone($schedule))
            ->filter()
            ->unique()
            ->values();

        if ($phones->count() !== 1) {
            throw new \InvalidArgumentException('合併寄件需為同一客戶電話');
        }

        foreach ($schedules as $schedule) {
            if ($schedule->invoice_sent) {
                throw new \InvalidArgumentException('已寄出的項目無法合併');
            }

            if (! $schedule->needs_mail && ! $schedule->needs_invoice && ! $schedule->needs_receipt) {
                throw new \InvalidArgumentException('所選項目不需寄件追蹤');
            }

            $report = $schedule->dailyReport;

            if ($report && $report->invoice_sent) {
                throw new \InvalidArgumentException('已寄出的回報無法合併');
            }
        }
    }
}
