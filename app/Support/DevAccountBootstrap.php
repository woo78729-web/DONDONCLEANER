<?php

namespace App\Support;

use App\Models\User;

class DevAccountBootstrap
{
    /**
     * @return array<int, string>
     */
    public static function ensureAccounts(): array
    {
        $devAdminPassword = env('SEED_ADMIN_PASSWORD', 'admin1');
        $password = env('SEED_DEFAULT_PASSWORD');

        if (! is_string($password) || $password === '') {
            $password = $devAdminPassword;
        }

        if (strlen($password) < 6) {
            throw new \RuntimeException('SEED_DEFAULT_PASSWORD 長度至少 6 字元。');
        }

        $accounts = [
            ['account' => 'admin1', 'name' => '管理員一', 'role' => 'admin', 'password' => $devAdminPassword],
            ['account' => 'admin2', 'name' => '管理員二', 'role' => 'admin', 'password' => $password],
            ['account' => 'finance1', 'name' => '財務一', 'role' => 'finance', 'password' => $password, 'phone' => '0933333333'],
            ['account' => 'cs1', 'name' => '客服一', 'role' => 'customer_service', 'password' => 'cs1', 'phone' => '0955555555'],
            ['account' => 'emp1', 'name' => '員工一', 'role' => 'employee', 'password' => 'emp1', 'phone' => '0911111111', 'bank_account' => '822-123456789012'],
            ['account' => 'emp2', 'name' => '員工二', 'role' => 'employee', 'password' => 'emp2', 'phone' => '0922222222', 'bank_account' => '013-987654321098'],
            ['account' => 'shifu1', 'name' => '師傅一', 'role' => 'employee', 'password' => 'shifu1', 'phone' => '0944444444', 'bank_account' => '822-111122223333'],
        ];

        $messages = [];

        foreach ($accounts as $account) {
            $existing = User::withTrashed()->where('account', $account['account'])->first();

            if ($existing?->trashed()) {
                $existing->restore();
            }

            $payload = [
                'password' => $account['password'],
                'name' => $account['name'],
                'role' => $account['role'],
                'is_active' => true,
            ];

            if (isset($account['phone'])) {
                $payload['phone'] = $account['phone'];
            }

            if (isset($account['bank_account'])) {
                $payload['bank_account'] = $account['bank_account'];
            }

            if ($account['role'] === 'employee') {
                $payload['rules_accepted_at'] = $existing?->rules_accepted_at ?? now();
                $payload['must_change_password'] = false;
            }

            User::query()->updateOrCreate(
                ['account' => $account['account']],
                $payload
            );

            $messages[] = $account['account'].' / '.$account['password'];
        }

        return $messages;
    }
}
