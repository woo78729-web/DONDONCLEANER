<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('company_remittances', 'expected_remittance_date')) {
            Schema::table('company_remittances', function (Blueprint $table) {
                $table->date('expected_remittance_date')->nullable()->after('amount');
            });
        }

        if (! Schema::hasColumn('company_remittances', 'expected_remittance_date')) {
            return;
        }

        try {
            DB::table('company_remittances')
                ->whereNull('expected_remittance_date')
                ->orderBy('id')
                ->chunkById(100, function ($rows) {
                    foreach ($rows as $row) {
                        $workDate = DB::table('daily_reports')
                            ->join('daily_schedules', 'daily_schedules.id', '=', 'daily_reports.schedule_id')
                            ->where('daily_reports.id', $row->report_id)
                            ->value('daily_schedules.work_date');

                        if ($workDate === null) {
                            continue;
                        }

                        DB::table('company_remittances')
                            ->where('id', $row->id)
                            ->update(['expected_remittance_date' => $workDate]);
                    }
                });
        } catch (\Throwable) {
            // Backfill is best-effort; column addition is enough for deploy stability.
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('company_remittances', 'expected_remittance_date')) {
            Schema::table('company_remittances', function (Blueprint $table) {
                $table->dropColumn('expected_remittance_date');
            });
        }
    }
};
