<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_remittances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_id')->unique()->constrained('daily_reports')->cascadeOnDelete();
            $table->unsignedInteger('amount');
            $table->string('status', 20)->default('pending');
            $table->timestamp('reminded_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_remittances');
    }
};
