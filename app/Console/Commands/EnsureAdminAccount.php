<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\RolePermission;
use Illuminate\Console\Command;

class EnsureAdminAccount extends Command
{
    protected $signature = 'admin:ensure
                            {account : 登入帳號}
                            {password : 登入密碼（至少 6 碼）}
                            {--name= : 顯示姓名}
                            {--role=admin : 角色 admin|finance|customer_service|employee}';

    protected $description = '建立或重設管理員／員工帳號（正式環境部署後使用）';

    public function handle(): int
    {
        $account = trim((string) $this->argument('account'));
        $password = trim((string) $this->argument('password'));
        $name = trim((string) ($this->option('name') ?: $account));
        $role = (string) $this->option('role');

        if ($account === '') {
            $this->error('帳號不可為空。');

            return self::FAILURE;
        }

        if (strlen($password) < 6) {
            $this->error('密碼至少 6 碼。');

            return self::FAILURE;
        }

        if (! in_array($role, RolePermission::roles(), true)) {
            $this->error('角色無效，請使用：'.implode('、', RolePermission::roles()));

            return self::FAILURE;
        }

        $user = User::withTrashed()->where('account', $account)->first();

        if ($user?->trashed()) {
            $user->restore();
        }

        $payload = [
            'password' => $password,
            'name' => $name,
            'role' => $role,
            'is_active' => true,
        ];

        if ($role === 'employee') {
            $payload['rules_accepted_at'] = $user?->rules_accepted_at ?? now();
            $payload['must_change_password'] = false;
        } else {
            $payload['must_change_password'] = false;
            if ($user?->rules_accepted_at === null && $role !== 'employee') {
                $payload['rules_accepted_at'] = now();
            }
        }

        $user = User::query()->updateOrCreate(
            ['account' => $account],
            $payload
        );

        $user->tokens()->delete();

        $this->info('帳號已就緒：'.$user->account.'（'.RolePermission::label($user->role).'）');
        $this->line('請使用上述帳號與您剛設定的密碼登入。');

        return self::SUCCESS;
    }
}
