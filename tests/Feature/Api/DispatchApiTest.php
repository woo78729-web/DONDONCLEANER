<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DispatchApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
        ]);
    }

    public function test_admin_can_create_schedule_and_employee_can_submit_report_once(): void
    {
        Sanctum::actingAs($this->admin);

        $scheduleResponse = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'task_details' => '11離11000',
            'notes' => '測試',
        ]);

        $scheduleResponse->assertCreated()
            ->assertJsonPath('status', 'success');

        $scheduleId = $scheduleResponse->json('data.id');

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data.schedules');

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $scheduleId,
            'completed_units' => 2,
            'collected_amount' => 22000,
        ])->assertCreated()
            ->assertJsonPath('status', 'success');

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $scheduleId,
            'completed_units' => 2,
            'collected_amount' => 22000,
        ])->assertStatus(400)
            ->assertJsonPath('message', '此班表已有回報紀錄，無法重複填寫');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonPath('data.summary.total_reports', 1)
            ->assertJsonPath('data.summary.total_collected_amount', 22000)
            ->assertJsonPath('data.pagination.total', 1);
    }

    public function test_employee_cannot_access_admin_routes(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/admin/reports')
            ->assertForbidden()
            ->assertJsonPath('status', 'error');
    }
}
