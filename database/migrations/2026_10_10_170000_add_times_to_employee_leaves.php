<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_leaves', function (Blueprint $table) {
            $table->char('start_time', 5)->nullable()->after('leave_date');
            $table->char('end_time', 5)->nullable()->after('start_time');
        });
    }

    public function down(): void
    {
        Schema::table('employee_leaves', function (Blueprint $table) {
            $table->dropColumn(['start_time', 'end_time']);
        });
    }
};
