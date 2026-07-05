<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class DispatchApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    private User $customerService;

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

        $this->customerService = User::query()->create([
            'account' => 'cs1',
            'password' => Hash::make('password123'),
            'name' => '客服',
            'role' => 'customer_service',
            'is_active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_admin_can_create_schedule_and_employee_can_submit_report_once(): void
    {
        Sanctum::actingAs($this->admin);

        $scheduleResponse = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => $this->futureWorkDate(),
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 11, 'unit_price' => 1000],
            ],
            'needs_invoice' => false,
            'notes' => '測試',
        ]);

        $scheduleResponse->assertCreated()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.customer_source', 'line');

        $scheduleId = $scheduleResponse->json('data.id');

        Sanctum::actingAs($this->employee);

        $workDate = $this->futureWorkDate();

        $this->getJson('/api/employee/schedules?date_from='.$workDate.'&date_to='.$workDate)
            ->assertOk()
            ->assertJsonCount(1, 'data.schedules');

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $scheduleId,
            'completed_units' => 11,
            'collected_amount' => 11000,
        ])->assertCreated()
            ->assertJsonPath('status', 'success');

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $scheduleId,
            'completed_units' => 11,
            'collected_amount' => 11000,
        ])->assertStatus(400)
            ->assertJsonPath('message', '此班表已有回報紀錄，如需調整請聯絡管理員');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonPath('data.summary.total_reports', 1)
            ->assertJsonPath('data.summary.total_collected_amount', 11000)
            ->assertJsonPath('data.pagination.total', 1);
    }

    public function test_admin_can_backfill_schedule_in_current_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        Sanctum::actingAs($this->admin);

        $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-02',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 11, 'unit_price' => 1000],
            ],
            'needs_invoice' => false,
        ])->assertCreated()
            ->assertJsonPath('status', 'success');
    }

    public function test_customer_service_can_backfill_schedule_in_current_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        Sanctum::actingAs($this->customerService);

        $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-02',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 11, 'unit_price' => 1000],
            ],
            'needs_invoice' => false,
        ])->assertCreated()
            ->assertJsonPath('data.cleaning_price', 0)
            ->assertJsonPath('data.task_details', '11台');
    }

    public function test_customer_service_can_mutate_previous_month_schedule(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        $schedule = DailySchedule::query()->create(array_merge(
            $this->scheduleAttributes([
                'user_id' => $this->employee->id,
                'work_date' => '2026-06-28',
            ]),
        ));

        Sanctum::actingAs($this->customerService);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_name' => '客服可改',
        ])->assertOk()
            ->assertJsonPath('data.customer_name', '客服可改');

        $this->deleteJson('/api/admin/schedules/'.$schedule->id)
            ->assertOk();
    }

    public function test_admin_can_mutate_previous_month_schedule(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        $schedule = DailySchedule::query()->create(array_merge(
            $this->scheduleAttributes([
                'user_id' => $this->employee->id,
                'work_date' => '2026-06-28',
            ]),
        ));

        Sanctum::actingAs($this->admin);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_name' => '管理員可改',
        ])->assertOk()
            ->assertJsonPath('data.customer_name', '管理員可改');
    }

    public function test_customer_service_can_create_schedule_in_previous_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        Sanctum::actingAs($this->customerService);

        $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => '2026-06-28',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 11, 'unit_price' => 1000],
            ],
            'needs_invoice' => false,
        ])->assertCreated()
            ->assertJsonPath('data.customer_name', '測試客戶');
    }

    public function test_employee_cannot_access_admin_routes(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/admin/reports')
            ->assertForbidden()
            ->assertJsonPath('status', 'error');
    }
}
