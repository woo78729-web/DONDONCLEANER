<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class ScheduleBackfillReportTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'admin',
            'account' => 'admin-backfill',
        ]);
        $this->employee = User::factory()->create([
            'role' => 'employee',
            'account' => 'emp-backfill',
        ]);
    }

    public function test_past_schedule_auto_reports(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-02',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => 'Test Customer',
            'customer_address' => 'Taipei',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1500],
            ],
            'needs_invoice' => false,
        ]);

        $response->assertCreated();

        $scheduleId = $response->json('data.id');
        $report = DailyReport::query()->where('schedule_id', $scheduleId)->first();

        $this->assertNotNull($report);
        $this->assertSame(2, (int) $report->completed_units);
        $this->assertSame(3000, (int) $report->collected_amount);
    }

    public function test_today_schedule_requires_technician_report(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-04 10:00:00'));

        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => '2026-07-04',
            'start_time' => '14:00',
            'end_time' => '16:00',
            'customer_name' => 'Same Day Customer',
            'customer_address' => 'Taipei',
            'customer_phone' => '0912345678',
            'customer_source' => 'line',
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1500],
            ],
            'needs_invoice' => false,
        ]);

        $response->assertCreated();

        $scheduleId = $response->json('data.id');
        $this->assertNull(DailyReport::query()->where('schedule_id', $scheduleId)->first());
    }

    public function test_backfill_command_creates_missing_past_reports(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-06 10:00:00'));

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-06-05',
            'start_time' => '09:00',
            'end_time' => '21:00',
            'customer_name' => '補單客戶',
            'ac_units' => 3,
            'pricing_lines' => [
                ['ac_units' => 3, 'unit_price' => 1000],
            ],
        ]));

        $this->assertNull(DailyReport::query()->where('schedule_id', $schedule->id)->first());

        $this->artisan('schedule:backfill-reports', ['--month' => '2026-06'])
            ->assertSuccessful();

        $report = DailyReport::query()->where('schedule_id', $schedule->id)->first();
        $this->assertNotNull($report);
        $this->assertSame(3, (int) $report->completed_units);
    }

    public function test_cleanup_removes_ghost_report_on_calendar_block(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-06 10:00:00'));

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-06-05',
            'schedule_kind' => \App\Models\CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK,
            'ac_units' => 0,
            'cleaning_price' => 0,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 0,
            'completed_units' => 0,
            'collected_amount' => 400,
            'paid_to_company' => false,
        ]);

        $this->artisan('schedule:backfill-reports', [
            '--month' => '2026-06',
            '--skip-cleanup' => false,
        ])->assertSuccessful();

        $this->assertNull(DailyReport::query()->where('schedule_id', $schedule->id)->first());
        $this->assertNotNull(\App\Models\DailySchedule::query()->find($schedule->id));
    }
}
