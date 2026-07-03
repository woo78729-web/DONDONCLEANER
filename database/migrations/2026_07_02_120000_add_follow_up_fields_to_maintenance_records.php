<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->text('follow_up_method')->nullable()->after('admin_notes');
            $table->unsignedInteger('service_amount')->default(0)->after('follow_up_method');
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->dropColumn(['follow_up_method', 'service_amount']);
        });
    }
};
