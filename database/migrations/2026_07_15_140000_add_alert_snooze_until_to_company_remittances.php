<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            Schema::table('company_remittances', function (Blueprint $table) {
                $table->timestamp('alert_snooze_until')->nullable()->after('reminded_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('company_remittances', 'alert_snooze_until')) {
            Schema::table('company_remittances', function (Blueprint $table) {
                $table->dropColumn('alert_snooze_until');
            });
        }
    }
};
