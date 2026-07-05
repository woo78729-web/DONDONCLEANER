<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->boolean('needs_receipt')->default(false)->after('needs_invoice');
            $table->boolean('invoice_charge_customer_tax')->default(false)->after('needs_receipt');
            $table->date('invoice_planned_date')->nullable()->after('invoice_charge_customer_tax');
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn([
                'needs_receipt',
                'invoice_charge_customer_tax',
                'invoice_planned_date',
            ]);
        });
    }
};
