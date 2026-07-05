<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manual_postage_entries', function (Blueprint $table) {
            $table->id();
            $table->string('year_month', 7);
            $table->unsignedInteger('amount')->default(28);
            $table->string('notes');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('year_month');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manual_postage_entries');
    }
};
