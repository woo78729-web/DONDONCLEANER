<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->string('import_source', 40)->nullable()->after('notes');
            $table->string('external_uid')->nullable()->after('import_source');
            $table->unique('external_uid');
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropUnique(['external_uid']);
            $table->dropColumn(['import_source', 'external_uid']);
        });
    }
};
