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

class MailTrackingApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

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
    }

    public function test_admin_can_list_pending_mail_tracking_items(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '師傅甲',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'needs_mail' => false,
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonPath('data.pending.schedules.0.needs_invoice', true)
            ->assertJsonStructure([
                'data' => [
                    'pending' => ['schedules', 'reports'],
                    'sent_this_month' => ['schedules', 'reports'],
                ],
            ])
            ->assertJsonMissingPath('data.sent_history');
    }

    public function test_admin_can_update_schedule_mail_tracking_and_mark_sent(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp2',
            'password' => Hash::make('password123'),
            'name' => '師傅乙',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
        ]));

        $this->patchJson("/api/admin/schedules/{$schedule->id}/mail-tracking", [
            'mail_recipient' => '測試店家',
            'mail_phone' => '0987654321',
            'mail_address' => '台北市大安區復興南路1號',
            'invoice_tax_id' => '12345678',
            'invoice_title' => '測試有限公司',
            'mail_tracking_number' => 'RR123456789TW',
            'invoice_sent' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.mail_recipient', '測試店家')
            ->assertJsonPath('data.invoice_tax_id', '12345678')
            ->assertJsonPath('data.invoice_title', '測試有限公司')
            ->assertJsonPath('data.mail_tracking_number', 'RR123456789TW')
            ->assertJsonPath('data.invoice_sent', true);

        $schedule->refresh();

        $this->assertSame('測試店家', $schedule->mail_recipient);
        $this->assertSame('RR123456789TW', $schedule->mail_tracking_number);
        $this->assertTrue($schedule->invoice_sent);
        $this->assertNotNull($schedule->invoice_sent_at);

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(0, 'data.pending.schedules')
            ->assertJsonPath('data.sent_this_month.schedules.0.id', $schedule->id);
    }

    public function test_admin_can_update_report_mail_tracking(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp3',
            'password' => Hash::make('password123'),
            'name' => '師傅丙',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 1,
            'collected_amount' => 11000,
            'needs_invoice_and_mail' => true,
            'needs_receipt_and_mail' => false,
            'invoice_sent' => false,
        ]);

        $this->patchJson("/api/admin/reports/{$report->id}/mail-tracking", [
            'mail_recipient' => '回報店家',
            'mail_phone' => '0911000222',
            'invoice_title' => '回報抬頭',
            'invoice_sent' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.invoice_sent', true);

        $report->refresh();
        $schedule->refresh();

        $this->assertTrue($report->invoice_sent);
        $this->assertSame('回報店家', $schedule->mail_recipient);
        $this->assertSame('回報抬頭', $schedule->invoice_title);
    }

    public function test_mail_tracking_report_payload_includes_schedule_customer_source(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'empfb',
            'password' => Hash::make('password123'),
            'name' => '師傅FB',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'customer_source' => 'fb',
            'fb_display_name' => 'Ching Chem',
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 1,
            'collected_amount' => 1500,
            'needs_invoice_and_mail' => false,
            'needs_receipt_and_mail' => true,
            'invoice_sent' => false,
        ]);

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonPath('data.pending.reports.0.daily_schedule.customer_source', 'fb')
            ->assertJsonPath('data.pending.reports.0.daily_schedule.fb_display_name', 'Ching Chem');
    }

    public function test_admin_can_search_mail_history_by_tax_id_title_and_phone(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp4',
            'password' => Hash::make('password123'),
            'name' => '師傅丁',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->subMonth()->toDateString(),
            'needs_invoice' => true,
            'mail_phone' => '0912345678',
            'invoice_tax_id' => '87654321',
            'invoice_title' => '歷史測試公司',
            'mail_tracking_number' => 'RR999888777TW',
        ]));

        $schedule->forceFill([
            'invoice_sent' => true,
            'invoice_sent_at' => now()->subMonth(),
        ])->save();

        $this->getJson('/api/admin/mail-tracking/history?tax_id=87654321')
            ->assertOk()
            ->assertJsonPath('data.schedules.0.invoice_tax_id', '87654321');

        $this->getJson('/api/admin/mail-tracking/history?title=歷史測試')
            ->assertOk()
            ->assertJsonPath('data.schedules.0.invoice_title', '歷史測試公司');

        $this->getJson('/api/admin/mail-tracking/history?phone=1234')
            ->assertOk()
            ->assertJsonPath('data.schedules.0.mail_phone', '0912345678');

        $this->getJson('/api/admin/mail-tracking/history')
            ->assertStatus(422);
    }

    public function test_admin_can_update_tracking_number_on_sent_schedule(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp5',
            'password' => Hash::make('password123'),
            'name' => '師傅戊',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
        ]));

        $schedule->forceFill([
            'invoice_sent' => true,
            'invoice_sent_at' => now()->subDay(),
        ])->save();

        $originalSentAt = $schedule->invoice_sent_at?->toDateTimeString();

        $this->patchJson("/api/admin/schedules/{$schedule->id}/mail-tracking", [
            'mail_tracking_number' => 'RR555666777TW',
            'invoice_sent' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.mail_tracking_number', 'RR555666777TW');

        $schedule->refresh();

        $this->assertSame('RR555666777TW', $schedule->mail_tracking_number);
        $this->assertSame($originalSentAt, $schedule->invoice_sent_at?->toDateTimeString());
    }
}
