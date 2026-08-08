<?php

namespace App\Console\Commands;

use App\Support\TomorrowSchedulePushSupport;
use Illuminate\Console\Command;

class SendTomorrowSchedules extends Command
{
    protected $signature = 'app:send-tomorrow-schedules
                            {--dry-run : 只預覽，不實際推播}';

    protected $description = '推播明日班表給已綁定 LINE 的師傅';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $result = TomorrowSchedulePushSupport::send(dryRun: $dryRun);

        $this->info(sprintf(
            '%s明日班表推播（%s）：綁定師傅 %d 人，已發送 %d，失敗 %d，無行程略過 %d',
            $dryRun ? '[預覽] ' : '',
            $result['date'],
            $result['recipients'],
            $result['sent'],
            $result['failed'],
            $result['skipped'],
        ));

        foreach ($result['details'] as $detail) {
            $this->line(sprintf(
                '  · %s (#%s) %s｜行程 %d 件',
                $detail['name'] ?? '-',
                $detail['user_id'] ?? '-',
                $detail['status'] ?? '-',
                $detail['schedule_count'] ?? 0,
            ));
        }

        return $result['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
