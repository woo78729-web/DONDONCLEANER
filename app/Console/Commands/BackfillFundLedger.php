<?php

namespace App\Console\Commands;

use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Support\FundRoutingService;
use Illuminate\Console\Command;

class BackfillFundLedger extends Command
{
    protected $signature = 'fund:backfill-ledger
        {--year-month= : 只補指定月份 YYYY-MM 的回報與匯款}
        {--dry-run : 只顯示將補齊的筆數，不寫入資料庫}';

    protected $description = '依既有回報與匯款紀錄補建資金流水帳（需手動執行）';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $yearMonth = $this->option('year-month');

        [$year, $month] = $this->resolveYearMonth($yearMonth);

        $reportQuery = DailyReport::query()
            ->with('dailySchedule')
            ->where('paid_to_company', false)
            ->where(function ($query) {
                $query->where('collected_amount', '>', 0)
                    ->orWhereNotNull('fund_routed_at');
            });

        if ($year !== null && $month !== null) {
            $reportQuery->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)->whereMonth('work_date', $month);
            });
        }

        $reports = $reportQuery->orderBy('id')->get();
        $reportCount = 0;

        foreach ($reports as $report) {
            if (FundRoutingService::customerPaidTotal($report) <= 0) {
                continue;
            }

            if ($dryRun) {
                $reportCount++;
                $this->line("Would route cash report #{$report->id}");

                continue;
            }

            FundRoutingService::onReportPosted($report);
            $reportCount++;
        }

        $remittanceQuery = CompanyRemittance::query()
            ->where('status', CompanyRemittance::STATUS_CONFIRMED);

        if ($year !== null && $month !== null) {
            $remittanceQuery->where(function ($query) use ($year, $month) {
                $query->where(function ($dated) use ($year, $month) {
                    $dated->whereYear('expected_remittance_date', $year)
                        ->whereMonth('expected_remittance_date', $month);
                })->orWhere(function ($fallback) use ($year, $month) {
                    $fallback->whereNull('expected_remittance_date')
                        ->whereHas('report.dailySchedule', function ($schedule) use ($year, $month) {
                            $schedule->whereYear('work_date', $year)->whereMonth('work_date', $month);
                        });
                });
            });
        }

        $remittances = $remittanceQuery->orderBy('id')->get();
        $remittanceCount = 0;

        foreach ($remittances as $remittance) {
            if ($dryRun) {
                if ($remittance->fund_transaction_id === null) {
                    $remittanceCount++;
                    $this->line("Would route confirmed remittance #{$remittance->id}");
                }

                continue;
            }

            FundRoutingService::onRemittanceConfirmed($remittance);
            $remittanceCount++;
        }

        if ($dryRun) {
            $this->info("Dry run complete. {$reportCount} cash report(s), {$remittanceCount} remittance(s) would be routed.");

            return self::SUCCESS;
        }

        $this->info("Done. Processed {$reportCount} cash report(s) and {$remittanceCount} confirmed remittance(s).");

        return self::SUCCESS;
    }

    /**
     * @return array{0:?int,1:?int}
     */
    private function resolveYearMonth(?string $yearMonth): array
    {
        if ($yearMonth === null || $yearMonth === '') {
            return [null, null];
        }

        if (! preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            throw new \InvalidArgumentException('year-month must be YYYY-MM');
        }

        [$year, $month] = array_map('intval', explode('-', $yearMonth, 2));

        return [$year, $month];
    }
}
