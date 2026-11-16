<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedule_announcement_events', function (Blueprint $table) {
            $table->id();
            $table->string('event_type', 20);
            $table->unsignedBigInteger('schedule_id')->nullable()->index();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('technician_name')->nullable();
            $table->string('customer_source', 20)->nullable();
            $table->string('contact_name')->nullable();
            $table->string('service_area', 50)->nullable();
            $table->unsignedInteger('ac_units')->default(0);
            $table->date('work_date')->nullable();
            $table->timestamps();

            $table->index(['event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_announcement_events');
    }
};
