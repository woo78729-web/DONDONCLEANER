<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropUnique(['external_uid']);
            $table->foreignId('performance_group_id')
                ->nullable()
                ->after('external_uid')
                ->constrained('performance_groups')
                ->nullOnDelete();
            $table->unique(['external_uid', 'performance_group_id']);
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropUnique(['external_uid', 'performance_group_id']);
            $table->dropConstrainedForeignId('performance_group_id');
            $table->unique('external_uid');
        });
    }
};
