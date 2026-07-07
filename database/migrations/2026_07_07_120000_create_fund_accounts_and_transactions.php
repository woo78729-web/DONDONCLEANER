<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fund_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name');
            $table->string('manager_label');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('fund_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_no', 32)->unique();
            $table->string('event_type', 64);
            $table->foreignId('from_account_id')->nullable()->constrained('fund_accounts')->nullOnDelete();
            $table->foreignId('to_account_id')->nullable()->constrained('fund_accounts')->nullOnDelete();
            $table->unsignedInteger('amount');
            $table->string('status', 20)->default('posted');
            $table->timestamp('occurred_at');
            $table->timestamp('posted_at')->nullable();
            $table->string('idempotency_key')->unique();
            $table->string('source_type');
            $table->unsignedBigInteger('source_id');
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reversal_of_id')->nullable()->constrained('fund_transactions')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['event_type', 'occurred_at']);
            $table->index(['source_type', 'source_id']);
            $table->index(['to_account_id', 'occurred_at']);
            $table->index(['from_account_id', 'occurred_at']);
        });

        $now = now();

        DB::table('fund_accounts')->insert([
            [
                'code' => 'dongdong',
                'name' => '東東帳',
                'manager_label' => '阿泰代收代管',
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'hongyi',
                'name' => '沒菌垢帳',
                'manager_label' => '宏逸代收代管',
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('fund_transactions');
        Schema::dropIfExists('fund_accounts');
    }
};
