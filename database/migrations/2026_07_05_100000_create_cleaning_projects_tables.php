<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cleaning_projects', function (Blueprint $table) {
            $table->id();
            $table->string('project_code', 32)->nullable()->unique();
            $table->string('title')->nullable();
            $table->string('status', 32)->default('in_progress');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('customer_name');
            $table->string('customer_phone', 50);
            $table->string('customer_address');
            $table->string('service_area', 50)->nullable();
            $table->string('customer_source', 20);
            $table->string('fb_display_name')->nullable();
            $table->string('line_display_name')->nullable();
            $table->unsignedInteger('total_ac_units')->default(0);
            $table->json('pricing_lines')->nullable();
            $table->unsignedInteger('ac_units')->default(0);
            $table->unsignedInteger('unit_price')->nullable();
            $table->unsignedInteger('cleaning_price')->default(0);
            $table->boolean('needs_invoice')->default(false);
            $table->boolean('needs_mail')->default(false);
            $table->string('mail_recipient')->nullable();
            $table->string('mail_phone', 50)->nullable();
            $table->string('mail_address')->nullable();
            $table->string('invoice_tax_id', 20)->nullable();
            $table->string('invoice_title')->nullable();
            $table->string('mail_tracking_number', 100)->nullable();
            $table->boolean('invoice_sent')->default(false);
            $table->timestamp('invoice_sent_at')->nullable();
            $table->date('planned_start_date');
            $table->date('planned_end_date');
            $table->timestamp('completed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'planned_start_date']);
        });

        Schema::create('cleaning_project_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cleaning_project_id')->constrained('cleaning_projects')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 20)->default('member');
            $table->timestamps();

            $table->unique(['cleaning_project_id', 'user_id']);
        });

        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->foreignId('cleaning_project_id')->nullable()->after('user_id')->constrained('cleaning_projects')->nullOnDelete();
            $table->string('schedule_kind', 20)->default('regular')->after('cleaning_project_id');
            $table->unsignedInteger('units_allocated')->nullable()->after('ac_units');
        });
    }

    public function down(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cleaning_project_id');
            $table->dropColumn(['schedule_kind', 'units_allocated']);
        });

        Schema::dropIfExists('cleaning_project_user');
        Schema::dropIfExists('cleaning_projects');
    }
};
