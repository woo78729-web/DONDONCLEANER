<?php

namespace App\Console\Commands;

use App\Models\AccountingSetting;
use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\EmployeeLeave;
use App\Models\LegacyMonthlyAdvance;
use App\Models\LegacyMonthlyLedger;
use App\Models\MaintenanceRecord;
use App\Models\MaintenanceRecordPhoto;
use App\Models\MonthlyAdvanceEntry;
use App\Models\PerformanceGroup;
use App\Support\DevAccountBootstrap;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ResetBusinessData extends Command
{
    protected $signature = 'dev:reset-business-data {--force : 略過確認提示}';

    protected $description = '清空派班、回報、金流、維修等業務資料，保留測試帳號';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('Production 環境禁止執行此指令。');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm('確定要清空所有派班與金流測試資料嗎？', false)) {
            $this->warn('已取消。');

            return self::SUCCESS;
        }

        $before = [
            'schedules' => DailySchedule::query()->count(),
            'reports' => DailyReport::query()->count(),
            'remittances' => CompanyRemittance::query()->count(),
            'maintenance' => MaintenanceRecord::query()->count(),
            'photos' => MaintenanceRecordPhoto::query()->count(),
            'advances' => MonthlyAdvanceEntry::query()->count(),
            'legacy_ledgers' => LegacyMonthlyLedger::query()->count(),
            'legacy_advances' => LegacyMonthlyAdvance::query()->count(),
            'leaves' => EmployeeLeave::query()->count(),
            'accounting_settings' => AccountingSetting::query()->count(),
        ];

        DB::transaction(function (): void {
            MaintenanceRecordPhoto::query()->delete();
            MaintenanceRecord::query()->delete();
            MonthlyAdvanceEntry::query()->delete();
            DailySchedule::query()->delete();
            LegacyMonthlyLedger::query()->delete();
            LegacyMonthlyAdvance::query()->delete();
            EmployeeLeave::query()->delete();
            AccountingSetting::query()->delete();
            PerformanceGroup::query()->delete();
        });

        if (Storage::disk('public')->exists('maintenance-photos')) {
            Storage::disk('public')->deleteDirectory('maintenance-photos');
        }

        DevAccountBootstrap::ensureAccounts();

        $after = [
            'schedules' => DailySchedule::query()->count(),
            'reports' => DailyReport::query()->count(),
            'remittances' => CompanyRemittance::query()->count(),
            'maintenance' => MaintenanceRecord::query()->count(),
            'photos' => MaintenanceRecordPhoto::query()->count(),
            'advances' => MonthlyAdvanceEntry::query()->count(),
            'legacy_ledgers' => LegacyMonthlyLedger::query()->count(),
            'legacy_advances' => LegacyMonthlyAdvance::query()->count(),
            'leaves' => EmployeeLeave::query()->count(),
            'accounting_settings' => AccountingSetting::query()->count(),
        ];

        $this->info('業務資料已重置為初始狀態（測試帳號保留）。');
        $this->newLine();
        $this->table(
            ['項目', '刪除前', '刪除後'],
            collect($before)->map(fn (int $count, string $key) => [
                $key,
                $count,
                $after[$key] ?? 0,
            ])->values()->all(),
        );

        $this->newLine();
        $this->line('測試帳號：admin1 / admin1（或其他 dev 帳號）');

        return self::SUCCESS;
    }
}
