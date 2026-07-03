<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_reports', function (Blueprint $table) {
            $table->unsignedInteger('planned_units')->default(0)->after('schedule_id');
            $table->unsignedInteger('skipped_units')->default(0)->after('completed_units');
            $table->string('skip_reason')->nullable()->after('skipped_units');
            $table->boolean('unit_mismatch')->default(false)->after('skip_reason');
            $table->boolean('has_tax')->default(false)->after('unit_mismatch');
            $table->boolean('needs_invoice_and_mail')->default(false)->after('has_tax');
            $table->boolean('needs_receipt_and_mail')->default(false)->after('needs_invoice_and_mail');
            $table->text('temporary_request')->nullable()->after('needs_receipt_and_mail');
            $table->unsignedInteger('temporary_postage')->default(0)->after('temporary_request');
            $table->unsignedInteger('report_invoice_tax_cost')->default(0)->after('temporary_postage');
        });
    }

    public function down(): void
    {
        Schema::table('daily_reports', function (Blueprint $table) {
            $table->dropColumn([
                'planned_units',
                'skipped_units',
                'skip_reason',
                'unit_mismatch',
                'has_tax',
                'needs_invoice_and_mail',
                'needs_receipt_and_mail',
                'temporary_request',
                'temporary_postage',
                'report_invoice_tax_cost',
            ]);
        });
    }
};
