<?php

namespace App\Support;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\MaintenanceRecord;
use App\Models\ScheduleAnnouncementEvent;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class DailyAnnouncementSupport
{
    /**
     * @return array{
     *   date: string,
     *   todos: array{
     *     pending_mail: list<array<string, mixed>>,
     *     pending_maintenance: list<array<string, mixed>>,
     *     pending_mail_count: int,
     *     pending_maintenance_count: int,
     *     total_count: int
     *   },
     *   activity: list<array<string, mixed>>,
     *   monthly: array{
     *     year_month: string,
     *     activity: list<array<string, mixed>>
     *   }
     * }
     */
    public static function build(?string $date = null, ?string $yearMonth = null): array
    {
        $day = $date
            ? Carbon::parse($date, config('app.timezone'))->startOfDay()
            : Carbon::now(config('app.timezone'))->startOfDay();
        $dayEnd = $day->copy()->endOfDay();
        $dateString = $day->toDateString();

        if ($yearMonth && preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            $monthAnchor = Carbon::createFromFormat('Y-m-d', $yearMonth.'-01', config('app.timezone'));
        } else {
            $monthAnchor = $day->copy();
        }

        $monthStart = $monthAnchor->copy()->startOfMonth()->startOfDay();
        $monthEnd = $monthAnchor->copy()->endOfMonth()->endOfDay();

        $pendingMail = self::pendingMailItems();
        $pendingMaintenance = self::pendingMaintenanceItems();

        $activity = self::buildActivity($day, $dayEnd, includeDate: false, limit: 100);
        $monthlyActivity = self::buildActivity($monthStart, $monthEnd, includeDate: true, limit: 400);

        return [
            'date' => $dateString,
            'todos' => [
                'pending_mail' => $pendingMail,
                'pending_maintenance' => $pendingMaintenance,
                'pending_mail_count' => count($pendingMail),
                'pending_maintenance_count' => count($pendingMaintenance),
                'total_count' => count($pendingMail) + count($pendingMaintenance),
            ],
            'activity' => $activity,
            'monthly' => [
                'year_month' => $monthStart->format('Y-m'),
                'activity' => $monthlyActivity,
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function pendingMailItems(): array
    {
        $scheduleItems = MailTrackingSupport::uniqueMailTrackingSchedules(
            DailySchedule::query()
                ->with([
                    'user:id,name,account',
                    'dailyReport:id,schedule_id,needs_invoice_and_mail,needs_receipt_and_mail,invoice_sent',
                ])
                ->where('needs_mail', true)
                ->where('invoice_sent', false)
                ->orderByDesc('work_date')
                ->limit(80)
                ->get()
                ->reject(function (DailySchedule $schedule) {
                    $report = $schedule->dailyReport;

                    if (! $report || $report->invoice_sent) {
                        return false;
                    }

                    return MailTrackingSupport::reportRequiresMailTracking($report);
                })
        )
            ->take(30)
            ->map(function (DailySchedule $schedule) {
                return [
                    'type' => 'mail',
                    'id' => 'schedule-'.$schedule->id,
                    'schedule_id' => $schedule->id,
                    'label' => sprintf(
                        '班表 #%d · %s · %s',
                        $schedule->id,
                        $schedule->work_date?->format('Y-m-d') ?? '-',
                        $schedule->customer_name ?: ($schedule->fb_display_name ?: '未填客戶')
                    ),
                    'detail' => $schedule->user?->name ? '師傅 '.$schedule->user->name : null,
                ];
            })
            ->values();

        $reportItems = MailTrackingSupport::uniqueMailTrackingReports(
            DailyReport::query()
                ->with([
                    'dailySchedule:id,customer_name,fb_display_name,work_date,user_id',
                    'dailySchedule.user:id,name',
                ])
                ->where(function ($builder) {
                    $builder
                        ->where('needs_invoice_and_mail', true)
                        ->orWhere('needs_receipt_and_mail', true);
                })
                ->where('invoice_sent', false)
                ->orderByDesc('created_at')
                ->limit(40)
                ->get()
        )
            ->take(20)
            ->map(function (DailyReport $report) {
                $schedule = $report->dailySchedule;

                return [
                    'type' => 'mail',
                    'id' => 'report-'.$report->id,
                    'schedule_id' => $schedule?->id,
                    'label' => sprintf(
                        '回報寄件 · 班表 #%s · %s',
                        $schedule?->id ?? '-',
                        $schedule?->customer_name ?: ($schedule?->fb_display_name ?: '未填客戶')
                    ),
                    'detail' => $schedule?->user?->name ? '師傅 '.$schedule->user->name : null,
                ];
            })
            ->values();

        $manualItems = collect(MailPostageAccounting::pendingManualPostageEntries())
            ->take(20)
            ->map(function (array $entry) {
                return [
                    'type' => 'mail',
                    'id' => 'manual-'.$entry['id'],
                    'schedule_id' => null,
                    'label' => sprintf(
                        '補寄郵資 · %s',
                        $entry['mail_recipient'] ?: ($entry['mail_phone'] ?: '#'.$entry['id'])
                    ),
                    'detail' => $entry['mail_address'] ?: null,
                ];
            })
            ->values();

        return $scheduleItems
            ->concat($reportItems)
            ->concat($manualItems)
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function pendingMaintenanceItems(): array
    {
        return MaintenanceRecord::query()
            ->with(['assignee:id,name', 'schedule:id,customer_name,work_date'])
            ->whereIn('status', [
                MaintenanceRecord::STATUS_OPEN,
                MaintenanceRecord::STATUS_IN_PROGRESS,
            ])
            ->orderByDesc('updated_at')
            ->limit(40)
            ->get()
            ->map(function (MaintenanceRecord $record) {
                $statusLabel = match ($record->status) {
                    MaintenanceRecord::STATUS_IN_PROGRESS => '處理中',
                    default => '待處理',
                };

                return [
                    'type' => 'maintenance',
                    'id' => 'maintenance-'.$record->id,
                    'maintenance_id' => $record->id,
                    'label' => sprintf(
                        '維修 #%d · %s · %s',
                        $record->id,
                        $statusLabel,
                        $record->customer_name
                            ?: ($record->schedule?->customer_name ?: '未填客戶')
                    ),
                    'detail' => $record->assignee?->name ? '負責 '.$record->assignee->name : null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function buildActivity(
        Carbon $rangeStart,
        Carbon $rangeEnd,
        bool $includeDate = false,
        int $limit = 100,
    ): array {
        $timezone = config('app.timezone');

        $scheduleEvents = DailySchedule::query()
            ->with(['user:id,name', 'creator:id,name'])
            ->whereBetween('created_at', [$rangeStart, $rangeEnd])
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(function (DailySchedule $schedule) use ($timezone, $includeDate) {
                $at = Carbon::parse($schedule->created_at)->timezone($timezone);
                $operator = $schedule->creator?->name ?: '舊單未記錄';
                $technician = $schedule->user?->name ?: '未指定師傅';
                $area = self::areaText($schedule->service_area);
                $units = (int) $schedule->ac_units;
                $amount = (int) $schedule->cleaning_price;
                $workDate = $schedule->work_date?->format('Y-m-d') ?? '未填日期';
                $sourceLabel = CustomerSource::label((string) ($schedule->customer_source ?: CustomerSource::PHONE));
                $contactName = self::contactDisplayName($schedule);
                $time = self::formatActivityTime($at, $includeDate);
                $detailLine = sprintf(
                    '%s %s 派單 %s %s %s %s %d台 · %s',
                    $time,
                    $operator,
                    $sourceLabel,
                    $technician,
                    $area,
                    $contactName,
                    $units,
                    self::formatAmount($amount)
                );

                return [
                    'type' => 'dispatch',
                    'id' => ($includeDate ? 'month-dispatch-' : 'dispatch-').$schedule->id,
                    'at' => $at->format('Y-m-d H:i'),
                    'time' => $time,
                    'sort_at' => $at->timestamp,
                    'actor' => $operator,
                    'action' => '派單',
                    'amount' => $amount,
                    'title' => $detailLine,
                    'summary' => sprintf('施工 %s · 班表 #%d · %s', $workDate, $schedule->id, self::formatAmount($amount)),
                    'detail_line' => $detailLine,
                ];
            });

        $reportEvents = DailyReport::query()
            ->with([
                'dailySchedule:id,customer_name,fb_display_name,line_display_name,customer_source,work_date,user_id,service_area,ac_units',
                'dailySchedule.user:id,name',
            ])
            ->whereBetween('created_at', [$rangeStart, $rangeEnd])
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(function (DailyReport $report) use ($timezone, $includeDate) {
                $schedule = $report->dailySchedule;
                $at = Carbon::parse($report->created_at)->timezone($timezone);
                $technician = $schedule?->user?->name ?: '未指定師傅';
                $area = self::areaText($schedule?->service_area);
                $units = (int) ($report->completed_units ?? $schedule?->ac_units ?? 0);
                $amount = (int) $report->collected_amount;
                $sourceLabel = CustomerSource::label((string) ($schedule?->customer_source ?: CustomerSource::PHONE));
                $contactName = $schedule ? self::contactDisplayName($schedule) : '未填名稱';
                $workDate = $schedule?->work_date?->format('Y-m-d') ?? '未填日期';
                $time = self::formatActivityTime($at, $includeDate);
                $detailLine = sprintf(
                    '%s %s 回報 %s %s %s %s %d台 · 收款 %s',
                    $time,
                    $technician,
                    $sourceLabel,
                    $area,
                    $contactName,
                    $workDate,
                    $units,
                    self::formatAmount($amount)
                );

                return [
                    'type' => 'report',
                    'id' => ($includeDate ? 'month-report-' : 'report-activity-').$report->id,
                    'at' => $at->format('Y-m-d H:i'),
                    'time' => $time,
                    'sort_at' => $at->timestamp,
                    'actor' => $technician,
                    'action' => '回報',
                    'amount' => $amount,
                    'title' => $detailLine,
                    'summary' => sprintf('班表 #%s · 收款 %s', $schedule?->id ?? '-', self::formatAmount($amount)),
                    'detail_line' => $detailLine,
                ];
            });

        $cancelEvents = ScheduleAnnouncementEvent::query()
            ->with('actor:id,name')
            ->where('event_type', ScheduleAnnouncementEvent::TYPE_CANCEL)
            ->whereBetween('created_at', [$rangeStart, $rangeEnd])
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(function (ScheduleAnnouncementEvent $event) use ($timezone, $includeDate) {
                $at = Carbon::parse($event->created_at)->timezone($timezone);
                $operator = $event->actor?->name ?: '未知操作者';
                $technician = $event->technician_name ?: '未指定師傅';
                $area = self::areaText($event->service_area);
                $units = (int) $event->ac_units;
                $sourceLabel = CustomerSource::label((string) ($event->customer_source ?: CustomerSource::PHONE));
                $contactName = $event->contact_name ?: '未填名稱';
                $workDate = $event->work_date?->format('Y-m-d') ?? '未填日期';
                $time = self::formatActivityTime($at, $includeDate);
                $detailLine = sprintf(
                    '%s %s 取消 %s %s %s %s %d台',
                    $time,
                    $operator,
                    $sourceLabel,
                    $technician,
                    $area,
                    $contactName,
                    $units
                );

                return [
                    'type' => 'cancel',
                    'id' => ($includeDate ? 'month-cancel-' : 'cancel-').$event->id,
                    'at' => $at->format('Y-m-d H:i'),
                    'time' => $time,
                    'sort_at' => $at->timestamp,
                    'actor' => $operator,
                    'action' => '取消',
                    'title' => $detailLine,
                    'summary' => sprintf('施工 %s · 原班表 #%s', $workDate, $event->schedule_id ?? '-'),
                    'detail_line' => $detailLine,
                ];
            });

        /** @var Collection<int, array<string, mixed>> $merged */
        $merged = $scheduleEvents
            ->concat($reportEvents)
            ->concat($cancelEvents)
            ->sortByDesc('sort_at')
            ->values()
            ->map(function (array $item) {
                unset($item['sort_at']);

                return $item;
            });

        return $merged->all();
    }

    private static function formatActivityTime(Carbon $at, bool $includeDate): string
    {
        if ($includeDate) {
            return $at->format('m/d H:i');
        }

        return $at->format('H:i');
    }

    private static function formatAmount(int $amount): string
    {
        return number_format($amount).'元';
    }

    private static function areaText(?string $serviceArea): string
    {
        if (! $serviceArea) {
            return '未填區域';
        }

        $label = TaitungServiceArea::label($serviceArea);

        if ($label === '' || $label === '未設定') {
            return '未填區域';
        }

        return str_ends_with($label, '區') || str_ends_with($label, '市') || str_ends_with($label, '鄉') || str_ends_with($label, '鎮')
            ? $label
            : $label.'區';
    }

    private static function contactDisplayName(DailySchedule $schedule): string
    {
        $source = (string) ($schedule->customer_source ?: CustomerSource::PHONE);

        if ($source === CustomerSource::LINE) {
            return $schedule->line_display_name
                ?: ($schedule->customer_name ?: '未填名稱');
        }

        if (CustomerSource::isFacebookFamily($source)) {
            return $schedule->fb_display_name
                ?: ($schedule->customer_name ?: '未填名稱');
        }

        return $schedule->customer_name ?: '未填名稱';
    }
}
