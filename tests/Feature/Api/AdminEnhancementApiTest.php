<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminEnhancementApiTest extends TestCase
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

    public function test_admin_can_update_schedule_and_deactivate_employee(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_address' => '原始地址',
            'customer_phone' => '0912345678',
            'task_details' => '11離11000',
            'notes' => null,
        ]);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_address' => '更新後地址',
        ])->assertOk()
            ->assertJsonPath('data.customer_address', '更新後地址');

        $this->employee->createToken('test');
        $this->assertDatabaseCount('personal_access_tokens', 1);

        $this->patchJson('/api/admin/users/'.$this->employee->id, [
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_admin_cannot_update_schedule_with_existing_report(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_address' => '原始地址',
            'customer_phone' => '0912345678',
            'task_details' => '11離11000',
            'notes' => null,
        ]);

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 1,
            'collected_amount' => 11000,
        ]);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_address' => '更新後地址',
        ])->assertStatus(400)
            ->assertJsonPath('message', '此班表已有回報紀錄，無法編輯');
    }

    public function test_admin_can_export_reports_csv(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create([
            'user_id' => $this->employee->id,
            'work_date' => '2026-06-29',
            'customer_address' => '台北市',
            'customer_phone' => '0912345678',
            'task_details' => '11離11000',
            'notes' => null,
        ]);

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 22000,
        ]);

        $response = $this->get('/api/admin/reports/export?date_from=2026-06-29&date_to=2026-06-29');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('清洗台數', $content);
        $this->assertStringContainsString('22000', $content);
        $this->assertStringContainsString('員工', $content);
    }
}
