<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_remittances', function (Blueprint $table) {
            $table->foreignId('fund_transaction_id')
                ->nullable()
                ->after('confirmed_at')
                ->constrained('fund_transactions')
                ->nullOnDelete();
            $table->foreignId('destination_account_id')
                ->nullable()
                ->after('fund_transaction_id')
                ->constrained('fund_accounts')
                ->nullOnDelete();
        });

        Schema::table('daily_reports', function (Blueprint $table) {
            $table->timestamp('fund_routed_at')->nullable()->after('paid_to_company');
        });
    }

    public function down(): void
    {
        Schema::table('daily_reports', function (Blueprint $table) {
            $table->dropColumn('fund_routed_at');
        });

        Schema::table('company_remittances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('destination_account_id');
            $table->dropConstrainedForeignId('fund_transaction_id');
        });
    }
};
