<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('rules_accepted_at')->nullable()->after('is_active');
            $table->boolean('must_change_password')->default(false)->after('rules_accepted_at');
        });

        DB::table('users')->update([
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['rules_accepted_at', 'must_change_password']);
        });
    }
};
