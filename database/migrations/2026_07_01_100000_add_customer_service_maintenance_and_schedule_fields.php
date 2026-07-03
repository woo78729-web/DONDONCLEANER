<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->string('fb_display_name')->nullable()->after('customer_source');
            $table->string('line_display_name')->nullable()->after('fb_display_name');
            $table->boolean('invoice_sent')->default(false)->after('needs_invoice');
            $table->timestamp('invoice_sent_at')->nullable()->after('invoice_sent');
        });

        Schema::table('daily_reports', function (Blueprint $table) {
            $table->boolean('invoice_sent')->default(false)->after('paid_to_company');
            $table->timestamp('invoice_sent_at')->nullable()->after('invoice_sent');
        });

        Schema::create('maintenance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schedule_id')->nullable()->constrained('daily_schedules')->nullOnDelete();
            $table->foreignId('reported_by')->constrained('users');
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('customer_phone', 50);
            $table->string('customer_name')->nullable();
            $table->string('customer_address')->nullable();
            $table->string('fb_display_name')->nullable();
            $table->string('line_display_name')->nullable();
            $table->text('issue_description');
            $table->string('status', 20)->default('open');
            $table->text('admin_notes')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('maintenance_record_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_record_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->constrained('users');
            $table->string('path');
            $table->string('caption')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_record_photos');
        Schema::dropIfExists('maintenance_records');

        Schema::table('daily_reports', function (Blueprint $table) {
            $table->dropColumn(['invoice_sent', 'invoice_sent_at']);
        });

        Schema::table('daily_schedules', function (Blueprint $table) {
            $table->dropColumn([
                'fb_display_name',
                'line_display_name',
                'invoice_sent',
                'invoice_sent_at',
            ]);
        });
    }
};
