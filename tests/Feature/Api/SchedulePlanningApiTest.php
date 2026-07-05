<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\EmployeeLeave;
use App\Models\User;
use App\Support\SchedulePlanningSupport;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class SchedulePlanningApiTest extends TestCase
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

    public function test_availability_returns_open_slots_for_selected_area(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = $this->futureWorkDate(3);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'start_time' => '09:00',
            'end_time' => '12:00',
            'service_area' => 'chishang',
            'ac_units' => 3,
        ]));

        $response = $this->getJson('/api/admin/planning/availability?areas=chishang&days=7')
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $day = collect($response->json('data.days'))
            ->firstWhere('date', $workDate);

        $this->assertNotNull($day);

        $employee = collect($day['employees'])->firstWhere('id', $this->employee->id);
        $this->assertNotNull($employee);
        $this->assertCount(1, $employee['jobs']);
        $this->assertSame('chishang', $employee['jobs'][0]['service_area']);
        $this->assertTrue(collect($employee['open_slots'])->contains('from', '13:00'));
    }

    public function test_availability_shows_full_day_when_filtered_area_has_no_jobs(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = $this->futureWorkDate(4);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'start_time' => '09:00',
            'end_time' => '12:00',
            'service_area' => 'taitung_city',
        ]));

        $response = $this->getJson('/api/admin/planning/availability?areas=chishang&days=7')
            ->assertOk();

        $day = collect($response->json('data.days'))
            ->firstWhere('date', $workDate);

        $employee = collect($day['employees'])->firstWhere('id', $this->employee->id);

        $this->assertSame([], $employee['jobs']);
        $this->assertTrue(collect($employee['open_slots'])->contains('label', '全日可排'));
    }

    public function test_availability_uses_one_hour_gap_after_same_area_job(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = $this->futureWorkDate(5);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'start_time' => '09:00',
            'end_time' => '15:00',
            'service_area' => 'chishang',
        ]));

        $response = $this->getJson('/api/admin/planning/availability?areas=chishang&days=7')
            ->assertOk();

        $day = collect($response->json('data.days'))
            ->firstWhere('date', $workDate);

        $employee = collect($day['employees'])->firstWhere('id', $this->employee->id);
        $slot = collect($employee['open_slots'])->firstWhere('from', '16:00');

        $this->assertNotNull($slot);
        $this->assertSame('16:00', $slot['from']);
        $this->assertSame('21:00', $slot['to']);
    }

    public function test_employee_cannot_leave_on_scheduled_day(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 22, 10, 0, 0));

        Sanctum::actingAs($this->employee);

        $workDate = $this->futureWorkDate(2);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
        ]));

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'date',
            'leave_date' => $workDate,
        ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error');

        Carbon::setTestNow();
    }

    public function test_employee_can_register_leave_during_window(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 22, 10, 0, 0));

        Sanctum::actingAs($this->employee);

        $leaveDate = Carbon::create(2026, 7, 8)->toDateString();

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'date',
            'leave_date' => $leaveDate,
            'note' => '家庭事務',
        ])
            ->assertCreated()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.leave_date', $leaveDate);

        $this->assertDatabaseHas('employee_leaves', [
            'user_id' => $this->employee->id,
            'leave_type' => EmployeeLeave::TYPE_DATE,
        ]);

        $this->assertSame(1, EmployeeLeave::query()
            ->where('user_id', $this->employee->id)
            ->whereDate('leave_date', $leaveDate)
            ->count());

        Carbon::setTestNow();
    }

    public function test_employee_cannot_register_current_month_leave_outside_new_window(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 22, 10, 0, 0));

        Sanctum::actingAs($this->employee);

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'date',
            'leave_date' => Carbon::create(2026, 6, 28)->toDateString(),
        ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error');

        Carbon::setTestNow();
    }

    public function test_new_employee_can_register_current_month_leave_within_three_days(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 10, 10, 0, 0));

        $newEmployee = User::query()->create([
            'account' => 'emp-new',
            'password' => Hash::make('password123'),
            'name' => '新人',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
            'created_at' => Carbon::create(2026, 6, 10, 9, 0, 0),
        ]);

        Sanctum::actingAs($newEmployee);

        $leaveDate = Carbon::create(2026, 6, 18)->toDateString();

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'date',
            'leave_date' => $leaveDate,
        ])
            ->assertCreated()
            ->assertJsonPath('data.leave_date', $leaveDate);

        Carbon::setTestNow();
    }

    public function test_new_employee_joined_after_25_can_register_next_month(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 27, 10, 0, 0));

        $newEmployee = User::query()->create([
            'account' => 'emp-late',
            'password' => Hash::make('password123'),
            'name' => '晚到新人',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
            'created_at' => Carbon::create(2026, 6, 27, 9, 0, 0),
        ]);

        Sanctum::actingAs($newEmployee);

        $this->getJson('/api/employee/leaves')
            ->assertOk()
            ->assertJsonPath('data.registration_open', true)
            ->assertJsonPath('data.allowed_months.0', '2026-06')
            ->assertJsonPath('data.allowed_months.1', '2026-07');

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'date',
            'leave_date' => Carbon::create(2026, 7, 5)->toDateString(),
        ])
            ->assertCreated();

        Carbon::setTestNow();
    }

    public function test_leave_registration_closed_outside_window(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 10, 10, 0, 0));

        Sanctum::actingAs($this->employee);

        $this->postJson('/api/employee/leaves', [
            'leave_type' => 'weekly',
            'weekday' => 1,
        ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error');

        Carbon::setTestNow();
    }

    public function test_admin_can_list_leaves(): void
    {
        Sanctum::actingAs($this->admin);

        EmployeeLeave::query()->create([
            'user_id' => $this->employee->id,
            'leave_type' => EmployeeLeave::TYPE_WEEKLY,
            'weekday' => 0,
        ]);

        $this->getJson('/api/admin/planning/leaves')
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(1, 'data.leaves');
    }

    public function test_leave_registration_window_helper(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 20, 9, 0, 0));
        $this->assertTrue(SchedulePlanningSupport::isLeaveRegistrationOpen());

        Carbon::setTestNow(Carbon::create(2026, 6, 19, 9, 0, 0));
        $this->assertFalse(SchedulePlanningSupport::isLeaveRegistrationOpen());

        Carbon::setTestNow();
    }
}
