<?php

namespace App\Support;

use App\Models\MaintenanceRecord;
use App\Models\MonthlyAdvanceEntry;
use App\Models\User;

class MaintenanceRecordSupport
{
    /**
     * @return list<string>
     */
    public static function statuses(): array
    {
        return [
            MaintenanceRecord::STATUS_OPEN,
            MaintenanceRecord::STATUS_IN_PROGRESS,
            MaintenanceRecord::STATUS_RESOLVED,
        ];
    }

    public static function statusLabel(string $status): string
    {
        return match ($status) {
            MaintenanceRecord::STATUS_IN_PROGRESS => '處理中',
            MaintenanceRecord::STATUS_RESOLVED => '已結案',
            default => '待處理',
        };
    }

    public static function canViewCompensation(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array($user->role, ['admin', 'customer_service', 'finance'], true);
    }

    public static function canEditCompensation(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array($user->role, ['admin', 'customer_service'], true);
    }

    /**
     * @return array{employee:int, company:int}
     */
    public static function compensationShares(MaintenanceRecord $record): array
    {
        $amount = (int) $record->service_amount;

        if ($amount <= 0 || ! $record->requires_compensation) {
            return ['employee' => 0, 'company' => 0];
        }

        if ($record->is_warranty_case) {
            $employeeShare = intdiv($amount, 2);
            $companyShare = $amount - $employeeShare;

            return [
                'employee' => $employeeShare,
                'company' => $companyShare,
            ];
        }

        return [
            'employee' => $amount,
            'company' => 0,
        ];
    }

    public static function compensationResolvedYearMonth(MaintenanceRecord $record): ?string
    {
        if ($record->status !== MaintenanceRecord::STATUS_RESOLVED) {
            return null;
        }

        $resolvedAt = $record->resolved_at ?? $record->updated_at;

        return $resolvedAt?->format('Y-m');
    }

    public static function employeeCompensationDueForRecord(MaintenanceRecord $record): int
    {
        if ($record->status !== MaintenanceRecord::STATUS_RESOLVED
            || ! $record->requires_compensation
            || (int) $record->service_amount <= 0
        ) {
            return 0;
        }

        return self::compensationShares($record)['employee'];
    }

    /**
     * @return array<int, int>
     */
    public static function employeeCompensationDueByMonth(string $yearMonth): array
    {
        $records = MaintenanceRecord::query()
            ->where('status', MaintenanceRecord::STATUS_RESOLVED)
            ->where('requires_compensation', true)
            ->where('service_amount', '>', 0)
            ->whereNotNull('assigned_user_id')
            ->get();

        $totals = [];

        foreach ($records as $record) {
            if (self::compensationResolvedYearMonth($record) !== $yearMonth) {
                continue;
            }

            $employeeId = (int) $record->assigned_user_id;
            $totals[$employeeId] = ($totals[$employeeId] ?? 0) + self::employeeCompensationDueForRecord($record);
        }

        return $totals;
    }

    public static function employeeCompensationDue(int $userId, string $yearMonth): int
    {
        return self::employeeCompensationDueByMonth($yearMonth)[$userId] ?? 0;
    }

    /**
     * @return array<string, mixed>
     */
    public static function payload(MaintenanceRecord $record, ?User $viewer = null): array
    {
        $record->loadMissing([
            'reporter:id,name,account,role',
            'assignee:id,name,account,role',
            'schedule:id,work_date,customer_name,customer_phone,customer_address',
            'photos.uploader:id,name,account',
        ]);

        $shares = self::compensationShares($record);
        $showCompensation = self::canViewCompensation($viewer);

        $payload = [
            'id' => $record->id,
            'schedule_id' => $record->schedule_id,
            'reported_by' => $record->reported_by,
            'assigned_user_id' => $record->assigned_user_id,
            'customer_phone' => $record->customer_phone,
            'customer_name' => $record->customer_name,
            'customer_address' => $record->customer_address,
            'fb_display_name' => $record->fb_display_name,
            'line_display_name' => $record->line_display_name,
            'issue_description' => $record->issue_description,
            'status' => $record->status,
            'status_label' => self::statusLabel($record->status),
            'admin_notes' => $record->admin_notes,
            'follow_up_method' => $record->follow_up_method,
            'requires_compensation' => (bool) $record->requires_compensation,
            'is_warranty_case' => (bool) $record->is_warranty_case,
            'resolved_at' => $record->resolved_at?->toDateTimeString(),
            'created_at' => $record->created_at?->toDateTimeString(),
            'updated_at' => $record->updated_at?->toDateTimeString(),
            'reporter' => $record->reporter,
            'assignee' => $record->assignee,
            'schedule' => $record->schedule,
            'photos' => $record->photos->map(fn ($photo) => [
                'id' => $photo->id,
                'url' => $photo->url,
                'caption' => $photo->caption,
                'uploaded_by' => $photo->uploaded_by,
                'uploader' => $photo->uploader,
                'created_at' => $photo->created_at?->toDateTimeString(),
            ])->values()->all(),
        ];

        if ($showCompensation) {
            $payload['service_amount'] = (int) $record->service_amount;
            $payload['employee_compensation_share'] = $shares['employee'];
            $payload['company_compensation_share'] = $shares['company'];
            $payload['advance_entry_id'] = $record->advance_entry_id;
        }

        $employeeDue = self::employeeCompensationDueForRecord($record);

        if ($employeeDue > 0 && $viewer && (int) $viewer->id === (int) $record->assigned_user_id) {
            $payload['employee_compensation_due_to_company'] = $employeeDue;
            $payload['employee_compensation_due_to_atai'] = $employeeDue;
        }

        if ($employeeDue > 0 && $showCompensation) {
            $payload['employee_compensation_due_to_company'] = $employeeDue;
            $payload['employee_compensation_due_to_atai'] = $employeeDue;
        }

        return $payload;
    }

    public static function syncCompensationAdvance(MaintenanceRecord $record): void
    {
        if ($record->status !== MaintenanceRecord::STATUS_RESOLVED) {
            if ($record->advance_entry_id) {
                MonthlyAdvanceEntry::query()->where('id', $record->advance_entry_id)->delete();
                $record->advance_entry_id = null;
                $record->saveQuietly();
            }

            return;
        }

        if (! $record->requires_compensation || (int) $record->service_amount <= 0) {
            if ($record->advance_entry_id) {
                MonthlyAdvanceEntry::query()->where('id', $record->advance_entry_id)->delete();
                $record->advance_entry_id = null;
                $record->saveQuietly();
            }

            return;
        }

        $shares = self::compensationShares($record);
        $yearMonth = ($record->resolved_at ?? $record->updated_at ?? now())->format('Y-m');
        $label = sprintf(
            '維修賠款 #%d %s',
            $record->id,
            $record->customer_name ?: $record->customer_phone
        );
        $notes = $record->is_warranty_case
            ? sprintf(
                '保內對半：公司代墊 %d，師傅須入公司 %d',
                (int) $record->service_amount,
                $shares['employee'],
            )
            : sprintf('非保內：公司代墊 %d，師傅須入公司 %d', (int) $record->service_amount, $shares['employee']);

        $payload = [
            'year_month' => $yearMonth,
            'partner' => MonthlyAccounting::PARTNER_ATAI,
            'label' => $label,
            'amount' => (int) $record->service_amount,
            'notes' => $notes,
        ];

        if ($record->advance_entry_id) {
            MonthlyAdvanceEntry::query()
                ->where('id', $record->advance_entry_id)
                ->update($payload);
        } else {
            $entry = MonthlyAdvanceEntry::query()->create($payload);
            $record->advance_entry_id = $entry->id;
            $record->saveQuietly();
        }
    }
}
