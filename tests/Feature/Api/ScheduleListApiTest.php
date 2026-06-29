<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScheduleListApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_show_schedules(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
        ]);

        $reported = DailySchedule::query()->create([
            'user_id' => $employee->id,
            'work_date' => '2026-06-29',
            'customer_address' => '地址A',
            'customer_phone' => '0911111111',
            'task_details' => '11離11000',
            'notes' => null,
        ]);

        DailyReport::query()->create([
            'schedule_id' => $reported->id,
            'completed_units' => 1,
            'collected_amount' => 11000,
        ]);

        $pending = DailySchedule::query()->create([
            'user_id' => $employee->id,
            'work_date' => '2026-06-30',
            'customer_address' => '地址B',
            'customer_phone' => '0922222222',
            'task_details' => '14離14000',
            'notes' => '備註',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/schedules?has_report=0')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.schedules.0.id', $pending->id);

        $this->getJson('/api/admin/schedules/'.$pending->id)
            ->assertOk()
            ->assertJsonPath('data.customer_address', '地址B')
            ->assertJsonPath('data.user.account', 'emp1');
    }
}
