<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->unsignedInteger('amount')->default(0);
            $table->string('label');
            $table->timestamps();
        });

        Schema::create('monthly_advance_entries', function (Blueprint $table) {
            $table->id();
            $table->string('year_month', 7);
            $table->string('partner', 20);
            $table->string('label');
            $table->integer('amount');
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->index(['year_month', 'partner']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_advance_entries');
        Schema::dropIfExists('accounting_settings');
    }
};
