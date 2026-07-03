<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_leaves', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('leave_type', 20);
            $table->date('leave_date')->nullable();
            $table->unsignedTinyInteger('weekday')->nullable();
            $table->string('note', 500)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'leave_date']);
            $table->index(['user_id', 'weekday']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_leaves');
    }
};
