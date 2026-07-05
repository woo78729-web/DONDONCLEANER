<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('manual_postage_entries', function (Blueprint $table) {
            $table->string('mail_recipient')->nullable()->after('amount');
            $table->string('mail_phone', 50)->nullable()->after('mail_recipient');
            $table->string('mail_address')->nullable()->after('mail_phone');
        });
    }

    public function down(): void
    {
        Schema::table('manual_postage_entries', function (Blueprint $table) {
            $table->dropColumn(['mail_recipient', 'mail_phone', 'mail_address']);
        });
    }
};
