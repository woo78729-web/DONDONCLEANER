<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_groups', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('label');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('legacy_monthly_ledgers', function (Blueprint $table) {
            $table->id();
            $table->string('year_month', 7);
            $table->foreignId('performance_group_id')->constrained()->cascadeOnDelete();
            $table->json('daily_units')->nullable();
            $table->unsignedInteger('units_1500')->default(0);
            $table->unsignedInteger('units_1300')->default(0);
            $table->unsignedInteger('units_1000')->default(0);
            $table->integer('total_revenue')->default(0);
            $table->integer('gross_profit')->default(0);
            $table->integer('net_profit')->default(0);
            $table->integer('hongyi_share')->default(0);
            $table->string('source')->default('import');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['year_month', 'performance_group_id']);
        });

        Schema::create('legacy_monthly_advances', function (Blueprint $table) {
            $table->id();
            $table->string('year_month', 7);
            $table->string('partner', 20);
            $table->string('label');
            $table->integer('amount');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_monthly_advances');
        Schema::dropIfExists('legacy_monthly_ledgers');
        Schema::dropIfExists('performance_groups');
    }
};
