<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class EmployeeReportApiTest extends TestCase
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

    public function test_employee_can_get_pending_reports_and_submit_expanded_report(): void
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

        $this->getJson('/api/employee/reports/pending?work_date='.$workDate)
            ->assertOk()
            ->assertJsonPath('data.work_date', $workDate)
            ->assertJsonCount(1, 'data.schedules');

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 3,
            'skip_reason' => '客戶取消 1 台',
            'has_tax' => false,
            'needs_receipt_and_mail' => true,
            'temporary_request' => '加洗濾網',
            'collected_amount' => 4500,
            'paid_to_company' => false,
        ])->assertCreated()
            ->assertJsonPath('data.completed_units', 3)
            ->assertJsonPath('data.skipped_units', 1)
            ->assertJsonPath('data.unit_mismatch', true)
            ->assertJsonPath('data.temporary_postage', 28)
            ->assertJsonPath('data.collected_amount', 4500);

        $this->getJson('/api/employee/reports/history')
            ->assertOk()
            ->assertJsonCount(1, 'data.reports');

        $yearMonth = now()->format('Y-m');

        $this->getJson('/api/employee/reports/summary?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.total_collected', 4500)
            ->assertJsonPath('data.completed_units', 3);
    }

    public function test_employee_cannot_resubmit_report(): void
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

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 2000,
        ])->assertCreated();

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 2000,
        ])->assertStatus(400)
            ->assertJsonPath('message', '此班表已有回報紀錄，如需調整請聯絡管理員');
    }

    public function test_admin_can_update_employee_report(): void
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
            'completed_units' => 2,
            'collected_amount' => 2000,
        ])->json('data.id');

        Sanctum::actingAs($this->admin);

        $this->patchJson('/api/admin/reports/'.$reportId, [
            'completed_units' => 1,
            'skip_reason' => '現場少一台',
            'collected_amount' => 1000,
        ])->assertOk()
            ->assertJsonPath('data.completed_units', 1)
            ->assertJsonPath('data.skipped_units', 1)
            ->assertJsonPath('data.unit_mismatch', true);
    }

    public function test_employee_can_get_tomorrow_schedules(): void
    {
        $tomorrow = now()->addDay()->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $tomorrow,
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?view=tomorrow')
            ->assertOk()
            ->assertJsonPath('data.work_date', $tomorrow)
            ->assertJsonCount(1, 'data.schedules');
    }

    public function test_employee_can_get_today_schedules(): void
    {
        $today = now()->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $today,
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?view=today')
            ->assertOk()
            ->assertJsonPath('data.work_date', $today)
            ->assertJsonCount(1, 'data.schedules');
    }

    public function test_today_schedules_pin_overdue_unreported_from_past_dates(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-07-06 09:00:00'));

        $pastDate = '2026-07-05';

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $pastDate,
            'start_time' => '14:00',
            'end_time' => '15:00',
            'customer_name' => '過期客戶',
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-06',
            'start_time' => '10:00',
            'end_time' => '11:00',
            'customer_name' => '今日客戶',
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?view=today')
            ->assertOk()
            ->assertJsonCount(2, 'data.schedules')
            ->assertJsonPath('data.overdue_unreported_count', 1)
            ->assertJsonPath('data.schedules.0.customer_name', '過期客戶')
            ->assertJsonPath('data.schedules.0.is_overdue_unreported', true)
            ->assertJsonPath('data.schedules.1.customer_name', '今日客戶')
            ->assertJsonPath('data.schedules.1.is_overdue_unreported', false);
    }

    public function test_pending_reports_pin_overdue_unreported_from_other_dates(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-07-06 09:00:00'));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-05',
            'start_time' => '09:00',
            'end_time' => '10:00',
            'customer_name' => '過期客戶',
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-06',
            'start_time' => '14:00',
            'end_time' => '15:00',
            'customer_name' => '今日客戶',
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/reports/pending?work_date=2026-07-06')
            ->assertOk()
            ->assertJsonCount(2, 'data.schedules')
            ->assertJsonPath('data.overdue_unreported_count', 1)
            ->assertJsonPath('data.schedules.0.customer_name', '過期客戶')
            ->assertJsonPath('data.schedules.1.customer_name', '今日客戶');
    }

    public function test_employee_schedule_range_is_capped_at_tomorrow(): void
    {
        $tomorrow = now()->addDay()->toDateString();
        $future = now()->addDays(3)->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $tomorrow,
        ]));

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?date_from='.$tomorrow.'&date_to='.$future)
            ->assertOk()
            ->assertJsonPath('data.date_range.to', $tomorrow)
            ->assertJsonCount(1, 'data.schedules');
    }
}
