<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->string('invoice_tax_id', 20)->nullable()->after('needs_invoice');
            $table->string('invoice_title')->nullable()->after('invoice_tax_id');
            $table->string('mail_tracking_number', 50)->nullable()->after('mail_address');
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn(['invoice_tax_id', 'invoice_title', 'mail_tracking_number']);
        });
    }
};
