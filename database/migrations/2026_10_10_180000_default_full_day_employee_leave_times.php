<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('employee_leaves')->whereNull('start_time')->update([
            'start_time' => '09:00',
        ]);

        DB::table('employee_leaves')->whereNull('end_time')->update([
            'end_time' => '21:00',
        ]);
    }

    public function down(): void
    {
        DB::table('employee_leaves')
            ->where('start_time', '09:00')
            ->where('end_time', '21:00')
            ->update([
                'start_time' => null,
                'end_time' => null,
            ]);
    }
};
