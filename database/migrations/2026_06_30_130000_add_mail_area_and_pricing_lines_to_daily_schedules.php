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
            $table->string('mail_recipient')->nullable()->after('customer_address');
            $table->string('mail_address')->nullable()->after('mail_recipient');
            $table->string('service_area', 20)->nullable()->after('mail_address');
            $table->json('pricing_lines')->nullable()->after('needs_invoice');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn(['mail_recipient', 'mail_address', 'service_area', 'pricing_lines']);
        });
    }
};
