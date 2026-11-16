<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\MaintenanceRecord;
use App\Models\User;
use App\Support\CustomerSource;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class DailyAnnouncementApiTest extends TestCase
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

    public function test_admin_can_view_daily_announcement_todos_and_activity(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 11, 15, 14, 30, 0, 'Asia/Taipei'));
        Sanctum::actingAs($this->admin);

        $this->admin->forceFill(['name' => '邱泰翔'])->save();
        $this->employee->forceFill(['name' => '王加和'])->save();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'created_by' => $this->admin->id,
            'work_date' => '2026-11-16',
            'customer_name' => '公告客戶',
            'customer_source' => 'fb',
            'fb_display_name' => 'leo',
            'service_area' => 'taitung_city',
            'ac_units' => 3,
            'needs_mail' => true,
            'needs_receipt' => true,
            'invoice_sent' => false,
        ]));
        $schedule->forceFill(['created_at' => '2026-11-15 09:15:00'])->save();

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 3,
            'completed_units' => 3,
            'collected_amount' => 4500,
            'paid_to_company' => false,
        ]);
        $report->forceFill(['created_at' => '2026-11-15 13:40:00'])->save();

        MaintenanceRecord::query()->create([
            'schedule_id' => $schedule->id,
            'reported_by' => $this->admin->id,
            'assigned_user_id' => $this->employee->id,
            'customer_name' => '維修客戶',
            'customer_phone' => '0911111111',
            'issue_description' => '漏水',
            'status' => MaintenanceRecord::STATUS_OPEN,
        ]);

        $response = $this->getJson('/api/admin/daily-announcement?year_month=2026-11')
            ->assertOk()
            ->assertJsonPath('data.date', '2026-11-15')
            ->assertJsonPath('data.todos.pending_mail_count', 1)
            ->assertJsonPath('data.todos.pending_maintenance_count', 1)
            ->assertJsonPath('data.todos.total_count', 2)
            ->assertJsonPath('data.monthly.year_month', '2026-11');

        $activity = collect($response->json('data.activity'));
        $this->assertContains('dispatch', $activity->pluck('type')->all());
        $this->assertContains('report', $activity->pluck('type')->all());

        $dispatch = $activity->firstWhere('type', 'dispatch');
        $this->assertSame('09:15', $dispatch['time']);
        $this->assertSame('09:15 邱泰翔 派單 FB 王加和 台東市 leo 3台', $dispatch['detail_line']);

        $reportActivity = $activity->firstWhere('type', 'report');
        $this->assertSame('13:40', $reportActivity['time']);
        $this->assertStringStartsWith('13:40 王加和 回報', $reportActivity['detail_line']);

        $monthly = collect($response->json('data.monthly.activity'));
        $monthlyDispatch = $monthly->firstWhere('type', 'dispatch');
        $this->assertSame('11/15 09:15 邱泰翔 派單 FB 王加和 台東市 leo 3台', $monthlyDispatch['detail_line']);

        Carbon::setTestNow();
    }

    public function test_employee_cannot_view_daily_announcement(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/admin/daily-announcement')->assertForbidden();
    }

    public function test_deleting_schedule_creates_cancel_announcement(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 11, 15, 16, 20, 0, 'Asia/Taipei'));
        Sanctum::actingAs($this->admin);
        $this->admin->forceFill(['name' => '邱泰翔'])->save();
        $this->employee->forceFill(['name' => '王加和'])->save();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'created_by' => $this->admin->id,
            'work_date' => '2026-11-19',
            'customer_source' => CustomerSource::FB,
            'fb_display_name' => 'leo',
            'service_area' => 'taitung_city',
            'ac_units' => 2,
        ]));

        $this->deleteJson('/api/admin/schedules/'.$schedule->id)->assertOk();
        $this->assertDatabaseMissing('daily_schedules', ['id' => $schedule->id]);

        $response = $this->getJson('/api/admin/daily-announcement?year_month=2026-11')
            ->assertOk();

        $cancel = collect($response->json('data.activity'))->firstWhere('type', 'cancel');
        $this->assertNotNull($cancel);
        $this->assertSame('16:20 邱泰翔 取消 FB 王加和 台東市 leo 2台', $cancel['detail_line']);
        $this->assertStringContainsString('原班表 #'.$schedule->id, $cancel['summary']);

        Carbon::setTestNow();
    }
}
