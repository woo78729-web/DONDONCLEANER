<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->boolean('requires_compensation')->default(false)->after('follow_up_method');
            $table->boolean('is_warranty_case')->default(false)->after('requires_compensation');
            $table->foreignId('advance_entry_id')->nullable()->after('service_amount')->constrained('monthly_advance_entries')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('advance_entry_id');
            $table->dropColumn(['requires_compensation', 'is_warranty_case']);
        });
    }
};
