<?php

namespace App\Console\Commands;

use App\Support\DevAccountBootstrap;
use Illuminate\Console\Command;

class EnsureDevAccounts extends Command
{
    protected $signature = 'dev:ensure-accounts';

    protected $description = '建立或重設本地測試帳號（admin1、emp1 等）';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('Production 環境禁止執行此指令。');

            return self::FAILURE;
        }

        $accounts = DevAccountBootstrap::ensureAccounts();

        $this->info('測試帳號已就緒：');
        foreach ($accounts as $account) {
            $this->line('  - '.$account);
        }

        return self::SUCCESS;
    }
}
