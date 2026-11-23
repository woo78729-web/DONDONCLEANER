<?php

namespace App\Support;

use App\Models\DailySchedule;
use App\Models\User;

/**
 * 客服派單與管理員相同，不再清掉金額／單價。
 * 保留此類別以免舊呼叫點中斷。
 */
class ScheduleCustomerServicePolicy
{
    public static function applies(User $user): bool
    {
        return $user->role === 'customer_service';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function preparePayload(array $payload, User $user, ?DailySchedule $existing = null): array
    {
        return $payload;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function finalizePayload(array $payload, User $user, ?DailySchedule $existing = null): array
    {
        return $payload;
    }
}
