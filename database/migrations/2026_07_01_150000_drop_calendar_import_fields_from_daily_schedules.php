<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('daily_schedules', 'import_source')
            && ! Schema::hasColumn('daily_schedules', 'external_uid')
            && ! Schema::hasColumn('daily_schedules', 'performance_group_id')) {
            return;
        }

        Schema::table('daily_schedules', function (Blueprint $table) {
            if (Schema::hasColumn('daily_schedules', 'performance_group_id')) {
                $this->dropCompositeUniqueIfExists($table);
                $table->dropConstrainedForeignId('performance_group_id');
            }

            $dropColumns = array_values(array_filter([
                Schema::hasColumn('daily_schedules', 'import_source') ? 'import_source' : null,
                Schema::hasColumn('daily_schedules', 'external_uid') ? 'external_uid' : null,
            ]));

            if ($dropColumns !== []) {
                $table->dropColumn($dropColumns);
            }
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            if (! Schema::hasColumn('daily_schedules', 'import_source')) {
                $table->string('import_source', 40)->nullable()->after('notes');
            }

            if (! Schema::hasColumn('daily_schedules', 'external_uid')) {
                $table->string('external_uid')->nullable()->after('import_source');
            }

            if (! Schema::hasColumn('daily_schedules', 'performance_group_id')) {
                $table->foreignId('performance_group_id')
                    ->nullable()
                    ->after('external_uid')
                    ->constrained('performance_groups')
                    ->nullOnDelete();
                $table->unique(['external_uid', 'performance_group_id']);
            }
        });
    }

    private function dropCompositeUniqueIfExists(Blueprint $table): void
    {
        try {
            $table->dropUnique(['external_uid', 'performance_group_id']);
        } catch (\Throwable) {
            //
        }
    }
};
