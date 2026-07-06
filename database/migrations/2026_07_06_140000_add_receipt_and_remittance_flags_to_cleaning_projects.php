<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cleaning_projects', function (Blueprint $table) {
            $table->boolean('needs_receipt')->default(false)->after('needs_invoice');
            $table->boolean('expects_company_remittance')->default(false)->after('needs_receipt');
        });
    }

    public function down(): void
    {
        Schema::table('cleaning_projects', function (Blueprint $table) {
            $table->dropColumn(['needs_receipt', 'expects_company_remittance']);
        });
    }
};
