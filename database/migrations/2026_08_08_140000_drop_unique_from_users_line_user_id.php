<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 舊版 migration 曾為 line_user_id 加上 unique；新安裝已無此索引，需相容兩種狀態
        $hasUnique = collect(Schema::getIndexes('users'))
            ->contains(fn (array $index) => ($index['name'] ?? null) === 'users_line_user_id_unique');

        if (! $hasUnique) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['line_user_id']);
        });
    }

    public function down(): void
    {
        $hasUnique = collect(Schema::getIndexes('users'))
            ->contains(fn (array $index) => ($index['name'] ?? null) === 'users_line_user_id_unique');

        if ($hasUnique) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->unique('line_user_id');
        });
    }
};
