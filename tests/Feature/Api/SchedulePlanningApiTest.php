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
        $this->assertTrue(collect($employee['open_slots'])->contains('label', '下午可排'));
    }

    public function test_availability_uses_all_jobs_for_open_slots_when_filtering_area(): void
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
        $this->assertTrue(collect($employee['open_slots'])->contains('label', '下午可排'));
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

        $leaveDate = $this->futureWorkDate(5);

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
