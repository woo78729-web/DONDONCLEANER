<?php

namespace App\Console\Commands;

use App\Models\CleaningProject;
use App\Support\CleaningProjectSupport;
use Illuminate\Console\Command;

class ConsolidateProjectSettlement extends Command
{
    protected $signature = 'project:consolidate-settlement
                            {project? : 專案代碼，例如 P260604-ABCD；省略時需搭配 --all}
                            {--all : 整理所有進行中專案}
                            {--dry-run : 只預覽，不寫入資料庫}';

    protected $description = '將專案由逐日派班收成整張工單（每位師傅一筆結算 + 行事曆占位）';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $projectCode = $this->argument('project');
        $all = (bool) $this->option('all');

        if (! $projectCode && ! $all) {
            $this->error('請提供專案代碼，或加上 --all 整理全部專案。');

            return self::FAILURE;
        }

        $projects = $all
            ? CleaningProject::query()->orderBy('id')->get()
            : CleaningProject::query()->where('project_code', $projectCode)->get();

        if ($projects->isEmpty()) {
            $this->error($projectCode
                ? "找不到專案代碼 {$projectCode}"
                : '沒有可整理的專案');

            return self::FAILURE;
        }

        $processed = 0;

        foreach ($projects as $project) {
            try {
                $summary = CleaningProjectSupport::consolidateProjectSettlement($project, $dryRun);
            } catch (\InvalidArgumentException $exception) {
                $this->warn("#{$project->id} {$project->project_code}: {$exception->getMessage()}");

                continue;
            }

            $processed++;
            $this->renderSummary($summary);
        }

        $this->info($dryRun
            ? "Dry run 完成，共預覽 {$processed} 筆專案。"
            : "完成，共整理 {$processed} 筆專案。");

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $summary
     */
    private function renderSummary(array $summary): void
    {
        $label = $summary['dry_run'] ? 'Would consolidate' : 'Consolidated';
        $code = $summary['project_code'] ?? '-';
        $title = $summary['title'] ?? '';

        $this->line("{$label} #{$summary['project_id']} {$code} {$title}");

        foreach ($summary['employees'] as $employee) {
            $this->line(sprintf(
                '  - %s：%d 台（原 %d 筆結算班表，移除 %d 筆）',
                $employee['name'],
                $employee['assigned_units'],
                $employee['settlement_schedules_before'],
                $employee['removed_settlement_schedules'],
            ));
        }

        if (($summary['calendar_blocks_created'] ?? 0) > 0) {
            $this->line("  · 行事曆占位 +{$summary['calendar_blocks_created']} 筆");
        }

        if (($summary['calendar_blocks_removed'] ?? 0) > 0) {
            $this->line("  · 清除零台舊班表 {$summary['calendar_blocks_removed']} 筆");
        }

        $this->line("  · 專案結算台數合計 {$summary['total_ac_units']} 台");
        $this->newLine();
    }
}
