<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL：report_id 的 UNIQUE 同時被 FK 使用，須先移除外鍵再 drop unique
        Schema::table('company_remittances', function (Blueprint $table) {
            $table->dropForeign(['report_id']);
        });

        Schema::table('company_remittances', function (Blueprint $table) {
            $table->dropUnique(['report_id']);
        });

        Schema::table('company_remittances', function (Blueprint $table) {
            $table->foreign('report_id')
                ->references('id')
                ->on('daily_reports')
                ->cascadeOnDelete();

            $table->foreignId('cleaning_project_id')
                ->nullable()
                ->after('report_id')
                ->constrained('cleaning_projects')
                ->nullOnDelete();

            $table->index(['cleaning_project_id', 'status']);
            $table->index('report_id');
        });

        DB::table('company_remittances')
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    $projectId = DB::table('daily_reports')
                        ->join('daily_schedules', 'daily_schedules.id', '=', 'daily_reports.schedule_id')
                        ->where('daily_reports.id', $row->report_id)
                        ->value('daily_schedules.cleaning_project_id');

                    if ($projectId) {
                        DB::table('company_remittances')
                            ->where('id', $row->id)
                            ->update(['cleaning_project_id' => $projectId]);
                    }
                }
            });
    }

    public function down(): void
    {
        Schema::table('company_remittances', function (Blueprint $table) {
            $table->dropForeign(['cleaning_project_id']);
            $table->dropIndex(['cleaning_project_id', 'status']);
            $table->dropForeign(['report_id']);
            $table->dropIndex(['report_id']);
            $table->dropColumn('cleaning_project_id');
        });

        Schema::table('company_remittances', function (Blueprint $table) {
            $table->unique('report_id');
            $table->foreign('report_id')
                ->references('id')
                ->on('daily_reports')
                ->cascadeOnDelete();
        });
    }
};
