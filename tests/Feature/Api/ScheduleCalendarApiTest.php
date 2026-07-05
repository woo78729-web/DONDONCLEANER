<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class ScheduleCalendarApiTest extends TestCase
{
    use CreatesScheduleTestData;
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
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function test_admin_calendar_view_returns_schedules_in_range(): void
    {
        Sanctum::actingAs($this->admin);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
        ]));

        $this->getJson('/api/admin/schedules?view=calendar&date_from='.now()->startOfMonth()->toDateString().'&date_to='.now()->endOfMonth()->toDateString())
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.schedules')
            ->assertJsonPath('data.schedules.0.start_time', '09:00');
    }

    public function test_admin_can_delete_schedule_without_report(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'start_time' => '13:00',
            'end_time' => '15:00',
            'ac_units' => 14,
            'cleaning_price' => 14000,
            'task_details' => '14台14000',
        ]));

        $this->deleteJson('/api/admin/schedules/'.$schedule->id)
            ->assertOk()
            ->assertJsonPath('message', '班表刪除成功');

        $this->assertDatabaseMissing('daily_schedules', ['id' => $schedule->id]);
    }

    public function test_admin_can_delete_schedule_with_report_and_dependents(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'start_time' => '13:00',
            'end_time' => '15:00',
            'ac_units' => 14,
            'cleaning_price' => 14000,
            'task_details' => '14台14000',
        ]));

        $report = $schedule->dailyReport()->create([
            'completed_units' => 1,
            'collected_amount' => 11000,
            'paid_to_company' => true,
        ]);

        \App\Support\CompanyRemittanceSupport::syncForReport($report);

        $this->deleteJson('/api/admin/schedules/'.$schedule->id)
            ->assertOk()
            ->assertJsonPath('message', '班表與相關回報、匯款紀錄已刪除');

        $this->assertDatabaseMissing('daily_schedules', ['id' => $schedule->id]);
        $this->assertDatabaseMissing('daily_reports', ['id' => $report->id]);
        $this->assertDatabaseMissing('company_remittances', ['report_id' => $report->id]);
    }

    public function test_employee_can_fetch_month_schedules(): void
    {
        $today = now()->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $today,
            'start_time' => '10:00',
            'end_time' => '12:00',
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?date_from='.now()->startOfMonth()->toDateString().'&date_to='.now()->endOfMonth()->toDateString())
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.schedules')
            ->assertJsonStructure([
                'data' => [
                    'date_range' => ['from', 'to'],
                    'schedules',
                ],
            ]);
    }
}
