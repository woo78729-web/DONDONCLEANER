<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->string('customer_name')->default('')->after('work_date');
            $table->unsignedSmallInteger('ac_units')->default(1)->after('customer_phone');
            $table->unsignedInteger('cleaning_price')->default(0)->after('ac_units');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn(['customer_name', 'ac_units', 'cleaning_price']);
        });
    }
};
