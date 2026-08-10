<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('manual_postage_entries')) {
            return;
        }

        Schema::table('manual_postage_entries', function (Blueprint $table) {
            if (! Schema::hasColumn('manual_postage_entries', 'invoice_sent')) {
                $table->boolean('invoice_sent')->default(false)->after('notes');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'billing_amount')) {
                $table->unsignedInteger('billing_amount')->default(0)->after('amount');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'needs_receipt')) {
                $table->boolean('needs_receipt')->default(true)->after('billing_amount');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'needs_invoice')) {
                $table->boolean('needs_invoice')->default(false)->after('needs_receipt');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'invoice_charge_customer_tax')) {
                $table->boolean('invoice_charge_customer_tax')->default(false)->after('needs_invoice');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'invoice_title')) {
                $table->string('invoice_title')->nullable()->after('mail_address');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'invoice_tax_id')) {
                $table->string('invoice_tax_id', 20)->nullable()->after('invoice_title');
            }

            if (! Schema::hasColumn('manual_postage_entries', 'mail_tracking_number')) {
                $table->string('mail_tracking_number', 100)->nullable()->after('invoice_tax_id');
            }
        });

        // 既有補寄皆已計入郵資，視為已寄出
        DB::table('manual_postage_entries')
            ->whereNotNull('mailed_at')
            ->update(['invoice_sent' => true]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('manual_postage_entries')) {
            return;
        }

        Schema::table('manual_postage_entries', function (Blueprint $table) {
            foreach ([
                'invoice_sent',
                'billing_amount',
                'needs_receipt',
                'needs_invoice',
                'invoice_charge_customer_tax',
                'invoice_title',
                'invoice_tax_id',
                'mail_tracking_number',
            ] as $column) {
                if (Schema::hasColumn('manual_postage_entries', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
