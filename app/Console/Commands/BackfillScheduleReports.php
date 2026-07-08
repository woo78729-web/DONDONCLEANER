<?php

namespace App\Console\Commands;

use App\Support\ScheduleBackfillSupport;
use Illuminate\Console\Command;

class BackfillScheduleReports extends Command
{
    protected $signature = 'schedule:backfill-reports
                            {--user= : 師傅 user id}
                            {--month= : 月份 YYYY-MM}
                            {--dry-run : 只預覽，不寫入}';

    protected $description = '補跑過去日期班表的自動回報（補單不需師傅手動填寫）';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $userId = $this->option('user') !== null ? (int) $this->option('user') : null;
        $yearMonth = $this->option('month') !== null ? (string) $this->option('month') : null;

        if ($yearMonth !== null && ! preg_match('/^\d{4}-\d{2}$/', $yearMonth)) {
            $this->error('月份格式須為 YYYY-MM');

            return self::FAILURE;
        }

        $result = ScheduleBackfillSupport::backfillMissingReports(
            userId: $userId,
            yearMonth: $yearMonth,
            dryRun: $dryRun,
        );

        $this->line(sprintf(
            '%s符合補單自動回報 %d 筆，%s %d 筆',
            $dryRun ? '[預覽] ' : '',
            $result['matched'],
            $dryRun ? '可建立' : '已建立',
            $result['created'],
        ));

        return self::SUCCESS;
    }
}
