<?php

namespace App\Console\Commands;

use App\Models\MonthlyFixedExpense;
use App\Support\MonthlyFixedExpenseSupport;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class BackfillMonthlyFixedExpenses extends Command
{
    protected $signature = 'accounting:backfill-monthly-fixed-expenses {--from= : 起始月份 YYYY-MM} {--to= : 結束月份 YYYY-MM} {--dry-run : 只顯示將補齊的月份，不寫入資料庫}';

    protected $description = '將目前固定開支數字寫入歷史月份的獨立快照（僅補缺漏月份）';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $amounts = MonthlyFixedExpenseSupport::currentGlobalAmountMap();
        $from = $this->option('from') ?: MonthlyFixedExpenseSupport::earliestAccountingYearMonth();
        $to = $this->option('to') ?: Carbon::now()->subMonth()->format('Y-m');

        if (! $from) {
            $this->error('找不到任何會計資料月份，無法 backfill。');

            return self::FAILURE;
        }

        if (! preg_match('/^\d{4}-\d{2}$/', (string) $from) || ! preg_match('/^\d{4}-\d{2}$/', (string) $to)) {
            $this->error('from / to 必須為 YYYY-MM 格式');

            return self::FAILURE;
        }

        $months = MonthlyFixedExpenseSupport::monthRange($from, $to);

        if ($months === []) {
            $this->warn("月份範圍無效：{$from} ~ {$to}");

            return self::SUCCESS;
        }

        $created = 0;
        $skipped = 0;

        foreach ($months as $yearMonth) {
            if (MonthlyFixedExpenseSupport::findForMonth($yearMonth)) {
                $skipped++;
                $this->line("Skip {$yearMonth} (already exists)");

                continue;
            }

            if ($dryRun) {
                $created++;
                $this->line("Would create {$yearMonth}");

                continue;
            }

            MonthlyFixedExpense::query()->create([
                'year_month' => $yearMonth,
                ...$amounts,
            ]);
            $created++;
            $this->line("Created {$yearMonth}");
        }

        $this->info($dryRun
            ? "Dry run complete. {$created} month(s) would be created, {$skipped} skipped."
            : "Done. {$created} month(s) created, {$skipped} skipped.");

        return self::SUCCESS;
    }
}
