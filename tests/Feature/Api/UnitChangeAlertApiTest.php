<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class UnitChangeAlertApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'account' => 'admin-alert',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->employee = User::query()->create([
            'account' => 'emp-alert',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function test_admin_sees_unit_change_alert_after_employee_reports_mismatch(): void
    {
        $workDate = now()->toDateString();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'ac_units' => 4,
            'pricing_lines' => [
                ['ac_units' => 4, 'unit_price' => 1500],
            ],
            'cleaning_price' => 6000,
            'task_details' => '4台1500=6000',
        ]));

        Sanctum::actingAs($this->employee);

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 3,
            'skip_reason' => '客戶取消 1 台',
            'collected_amount' => 4500,
        ])->assertCreated()
            ->assertJsonPath('data.unit_mismatch', true);

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/reports/unit-change-alerts')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.planned_units', 4)
            ->assertJsonPath('data.items.0.completed_units', 3)
            ->assertJsonPath('data.items.0.skip_reason', '客戶取消 1 台');
    }

    public function test_admin_can_dismiss_unit_change_alerts(): void
    {
        $workDate = now()->toDateString();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
        ]));

        Sanctum::actingAs($this->employee);

        $reportId = $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 1,
            'skip_reason' => '現場少一台',
            'collected_amount' => 1000,
        ])->json('data.id');

        Sanctum::actingAs($this->admin);

        $this->postJson('/api/admin/reports/unit-change-alerts/dismiss', [
            'report_ids' => [$reportId],
        ])->assertOk();

        $this->getJson('/api/admin/reports/unit-change-alerts')
            ->assertOk()
            ->assertJsonCount(0, 'data.items');

        $this->assertNotNull(
            DailyReport::query()->find($reportId)?->admin_unit_alert_dismissed_at
        );
    }
}
