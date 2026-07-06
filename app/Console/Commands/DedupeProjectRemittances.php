<?php

namespace App\Console\Commands;

use App\Models\CleaningProject;
use App\Support\CompanyRemittanceSupport;
use Illuminate\Console\Command;

class DedupeProjectRemittances extends Command
{
    protected $signature = 'remittance:dedupe-projects {--dry-run : 只顯示結果，不寫入資料庫}';

    protected $description = '合併專案工單重複的待匯款紀錄，保留拆帳群組';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $fixed = 0;

        CleaningProject::query()
            ->where('expects_company_remittance', true)
            ->orderBy('id')
            ->chunkById(50, function ($projects) use ($dryRun, &$fixed) {
                foreach ($projects as $project) {
                    if ($dryRun) {
                        CompanyRemittanceSupport::dedupeProjectRemittances($project, dryRun: true, onWouldFix: function () use (&$fixed, $project) {
                            $fixed++;
                            $this->line("Would fix project #{$project->id} ({$project->project_code})");
                        });

                        continue;
                    }

                    if (CompanyRemittanceSupport::dedupeProjectRemittances($project)) {
                        $fixed++;
                        $this->line("Fixed project #{$project->id} ({$project->project_code})");
                    }
                }
            });

        $this->info($dryRun
            ? "Dry run complete. {$fixed} project(s) would be deduped."
            : "Done. {$fixed} project(s) deduped.");

        return self::SUCCESS;
    }
}
