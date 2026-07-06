<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->ensureColumn('daily_schedules', 'invoice_sent_at');
        $this->ensureColumn('daily_reports', 'invoice_sent_at');

        if (Schema::hasTable('manual_postage_entries')) {
            $this->ensureColumn('manual_postage_entries', 'year_month');
        }
    }

    public function down(): void
    {
        // Repair migration only; keep columns on rollback.
    }

    private function ensureColumn(string $tableName, ?string $afterColumn): void
    {
        if (Schema::hasColumn($tableName, 'mailed_at')) {
            return;
        }

        $placeAfter = $afterColumn !== null && Schema::hasColumn($tableName, $afterColumn);

        try {
            Schema::table($tableName, function (Blueprint $table) use ($placeAfter, $afterColumn) {
                $column = $table->date('mailed_at')->nullable();

                if ($placeAfter) {
                    $column->after($afterColumn);
                }
            });
        } catch (\Throwable $exception) {
            if (! Schema::hasColumn($tableName, 'mailed_at')) {
                throw $exception;
            }
        }
    }
};
