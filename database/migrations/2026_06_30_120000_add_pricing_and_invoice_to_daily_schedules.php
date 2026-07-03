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
            $table->unsignedSmallInteger('unit_price')->default(1500)->after('cleaning_price');
            $table->boolean('needs_invoice')->default(false)->after('unit_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn(['unit_price', 'needs_invoice']);
        });
    }
};
