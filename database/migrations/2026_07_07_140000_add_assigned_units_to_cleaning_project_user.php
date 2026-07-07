<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cleaning_project_user', function (Blueprint $table) {
            $table->unsignedInteger('assigned_units')->default(0)->after('role');
        });

        $projects = DB::table('cleaning_projects')->pluck('id');

        foreach ($projects as $projectId) {
            $members = DB::table('cleaning_project_user')
                ->where('cleaning_project_id', $projectId)
                ->pluck('user_id');

            foreach ($members as $userId) {
                $units = (int) DB::table('daily_schedules')
                    ->where('cleaning_project_id', $projectId)
                    ->where('user_id', $userId)
                    ->whereIn('schedule_kind', ['regular', 'assignment', 'supplement'])
                    ->sum('ac_units');

                DB::table('cleaning_project_user')
                    ->where('cleaning_project_id', $projectId)
                    ->where('user_id', $userId)
                    ->update(['assigned_units' => $units]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('cleaning_project_user', function (Blueprint $table) {
            $table->dropColumn('assigned_units');
        });
    }
};
