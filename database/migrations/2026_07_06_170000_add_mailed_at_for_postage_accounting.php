<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->addMailedAtColumn('daily_schedules', 'invoice_sent_at');
        $this->addMailedAtColumn('daily_reports', 'invoice_sent_at');

        if (Schema::hasTable('manual_postage_entries')) {
            $this->addMailedAtColumn('manual_postage_entries', 'year_month');
        }

        $this->backfillMailedAt('daily_schedules');
        $this->backfillMailedAt('daily_reports');
        $this->backfillManualPostageMailedAt();
    }

    public function down(): void
    {
        if (Schema::hasTable('manual_postage_entries') && Schema::hasColumn('manual_postage_entries', 'mailed_at')) {
            Schema::table('manual_postage_entries', function (Blueprint $table) {
                $table->dropColumn('mailed_at');
            });
        }

        if (Schema::hasColumn('daily_reports', 'mailed_at')) {
            Schema::table('daily_reports', function (Blueprint $table) {
                $table->dropColumn('mailed_at');
            });
        }

        if (Schema::hasColumn('daily_schedules', 'mailed_at')) {
            Schema::table('daily_schedules', function (Blueprint $table) {
                $table->dropColumn('mailed_at');
            });
        }
    }

    private function addMailedAtColumn(string $tableName, ?string $afterColumn): void
    {
        if (Schema::hasColumn($tableName, 'mailed_at')) {
            return;
        }

        $placeAfter = $afterColumn !== null && Schema::hasColumn($tableName, $afterColumn);

        Schema::table($tableName, function (Blueprint $table) use ($placeAfter, $afterColumn) {
            $column = $table->date('mailed_at')->nullable();

            if ($placeAfter) {
                $column->after($afterColumn);
            }
        });
    }

    private function backfillMailedAt(string $tableName): void
    {
        if (
            ! Schema::hasColumn($tableName, 'mailed_at')
            || ! Schema::hasColumn($tableName, 'invoice_sent_at')
            || ! Schema::hasColumn($tableName, 'invoice_sent')
        ) {
            return;
        }

        try {
            DB::table($tableName)
                ->where('invoice_sent', true)
                ->whereNotNull('invoice_sent_at')
                ->whereNull('mailed_at')
                ->update(['mailed_at' => DB::raw('DATE(invoice_sent_at)')]);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function backfillManualPostageMailedAt(): void
    {
        if (
            ! Schema::hasTable('manual_postage_entries')
            || ! Schema::hasColumn('manual_postage_entries', 'mailed_at')
            || ! Schema::hasColumn('manual_postage_entries', 'year_month')
        ) {
            return;
        }

        try {
            DB::table('manual_postage_entries')
                ->whereNull('mailed_at')
                ->whereNotNull('year_month')
                ->where('year_month', 'like', '____-__')
                ->update(['mailed_at' => DB::raw("CONCAT(year_month, '-01')")]);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
};
