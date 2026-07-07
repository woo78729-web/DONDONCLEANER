<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monthly_fixed_expenses', function (Blueprint $table) {
            $table->id();
            $table->string('year_month', 7)->unique();
            $table->unsignedInteger('expense_control')->default(0);
            $table->unsignedInteger('expense_phone')->default(0);
            $table->unsignedInteger('expense_ai')->default(0);
            $table->unsignedInteger('expense_ad')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_fixed_expenses');
    }
};
