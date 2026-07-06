<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->uuid('mail_merge_group_id')->nullable()->after('mail_tracking_number');
            $table->index('mail_merge_group_id');
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropIndex(['mail_merge_group_id']);
            $table->dropColumn('mail_merge_group_id');
        });
    }
};
