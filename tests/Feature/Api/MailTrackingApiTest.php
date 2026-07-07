<?php

namespace Tests\Feature\Api;

use App\Models\CleaningProject;
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
            'needs_mail' => true,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
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
            'needs_mail' => true,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
        ]));

        $this->patchJson("/api/admin/schedules/{$schedule->id}/mail-tracking", [
            'mail_recipient' => '測試店家',
            'mail_phone' => '0987654321',
            'mail_address' => '台北市大安區復興南路1號',
            'invoice_tax_id' => '12345678',
            'invoice_title' => '測試有限公司',
            'mail_tracking_number' => 'RR123456789TW',
            'invoice_sent' => true,
            'mailed_at' => now()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.mail_recipient', '測試店家')
            ->assertJsonPath('data.invoice_tax_id', '12345678')
            ->assertJsonPath('data.invoice_title', '測試有限公司')
            ->assertJsonPath('data.mail_tracking_number', 'RR123456789TW')
            ->assertJsonPath('data.invoice_sent', true)
            ->assertJsonPath('data.mailed_at', now()->toDateString());

        $schedule->refresh();

        $this->assertSame('測試店家', $schedule->mail_recipient);
        $this->assertSame('RR123456789TW', $schedule->mail_tracking_number);
        $this->assertTrue($schedule->invoice_sent);
        $this->assertNotNull($schedule->invoice_sent_at);
        $this->assertSame(now()->toDateString(), $schedule->mailed_at?->format('Y-m-d'));

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
            'mailed_at' => now()->subMonth()->toDateString(),
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

    public function test_mail_tracking_schedule_payload_includes_billing_fields(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp-bill',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'ac_units' => 7,
            'unit_price' => 1000,
            'pricing_lines' => [[
                'ac_units' => 7,
                'unit_price' => 1000,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            'cleaning_price' => 7350,
            'task_details' => '7台1000(含稅)=7350',
            'needs_invoice' => true,
            'needs_mail' => true,
            'invoice_charge_customer_tax' => true,
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonPath('data.pending.schedules.0.ac_units', 7)
            ->assertJsonPath('data.pending.schedules.0.cleaning_price', 7350);
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
            'needs_mail' => true,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
        ]));

        $schedule->forceFill([
            'invoice_sent' => true,
            'invoice_sent_at' => now()->subDay(),
            'mailed_at' => now()->subDay()->toDateString(),
        ])->save();

        $originalSentAt = $schedule->invoice_sent_at?->toDateTimeString();
        $originalMailedAt = $schedule->mailed_at?->format('Y-m-d');

        $this->patchJson("/api/admin/schedules/{$schedule->id}/mail-tracking", [
            'mail_tracking_number' => 'RR555666777TW',
            'invoice_sent' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.mail_tracking_number', 'RR555666777TW');

        $schedule->refresh();

        $this->assertSame('RR555666777TW', $schedule->mail_tracking_number);
        $this->assertSame($originalSentAt, $schedule->invoice_sent_at?->toDateTimeString());
        $this->assertSame($originalMailedAt, $schedule->mailed_at?->format('Y-m-d'));
    }

    public function test_admin_can_backdate_mailed_at_when_marking_sent(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp6',
            'password' => Hash::make('password123'),
            'name' => '師傅己',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'needs_mail' => true,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
        ]));

        $backdated = now()->subMonth()->startOfMonth()->toDateString();

        $this->patchJson("/api/admin/schedules/{$schedule->id}/mail-tracking", [
            'invoice_sent' => true,
            'mailed_at' => $backdated,
        ])
            ->assertOk()
            ->assertJsonPath('data.mailed_at', $backdated);

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(0, 'data.sent_this_month.schedules');

        $schedule->refresh();
        $this->assertSame($backdated, $schedule->mailed_at?->format('Y-m-d'));
    }

    public function test_sent_this_month_list_uses_mailed_at_not_invoice_sent_at(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emp7',
            'password' => Hash::make('password123'),
            'name' => '師傅庚',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'needs_mail' => true,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => now()->toDateString(),
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonPath('data.sent_this_month.schedules.0.id', $schedule->id);

        $schedule->forceFill([
            'mailed_at' => now()->subMonth()->startOfMonth()->toDateString(),
        ])->save();

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(0, 'data.sent_this_month.schedules');
    }

    public function test_project_mail_tracking_uses_project_total_units_and_remittance_amount(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'empproj',
            'password' => Hash::make('password123'),
            'name' => '師傅專案',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $project = CleaningProject::query()->create([
            'project_code' => 'PTEST-MAIL',
            'status' => CleaningProject::STATUS_PENDING_INVOICE,
            'customer_name' => '馬蘭國小',
            'customer_phone' => '0915000081',
            'customer_address' => '950台東市新社三街6號',
            'customer_source' => 'line',
            'total_ac_units' => 107,
            'ac_units' => 107,
            'cleaning_price' => 112350,
            'needs_invoice' => true,
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 107, 'unit_price' => 1000, 'invoice_type' => 'duplicate', 'charge_customer_tax' => true],
            ],
            'planned_start_date' => '2026-06-04',
            'planned_end_date' => '2026-06-07',
            'invoice_title' => '臺東縣臺東市馬蘭國民小學',
            'invoice_tax_id' => '08104078',
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'cleaning_project_id' => $project->id,
            'schedule_kind' => CleaningProject::SCHEDULE_KIND_REGULAR,
            'user_id' => $employee->id,
            'work_date' => '2026-06-04',
            'customer_name' => '丁源',
            'customer_phone' => '0915000081',
            'needs_invoice' => true,
            'needs_mail' => true,
            'invoice_title' => '臺東縣臺東市馬蘭國民小學',
            'invoice_tax_id' => '08104078',
            'pricing_lines' => [
                ['ac_units' => 55, 'unit_price' => 1000, 'invoice_type' => 'duplicate', 'charge_customer_tax' => true],
            ],
            'ac_units' => 55,
            'cleaning_price' => 57750,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 55,
            'completed_units' => 55,
            'has_tax' => true,
            'needs_invoice_and_mail' => true,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);

        $response = $this->getJson('/api/admin/mail-tracking')
            ->assertOk();

        $reportPayload = collect($response->json('data.pending.reports'))
            ->first(fn (array $item) => (int) ($item['daily_schedule']['cleaning_project_id'] ?? 0) === $project->id);

        $this->assertNotNull($reportPayload);
        $this->assertSame(107, $reportPayload['billing_units']);
        $this->assertSame(112350, $reportPayload['billing_amount']);
        $this->assertSame(55, $reportPayload['daily_schedule']['cleaning_project']['completed_units']);
    }

    public function test_mail_tracking_accepts_year_month_for_monthly_sent_history(): void
    {
        Sanctum::actingAs($this->admin);

        $employee = User::query()->create([
            'account' => 'emphist',
            'password' => Hash::make('password123'),
            'name' => '師傅歷史',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $mailedAt = now()->subMonths(2)->startOfMonth()->addDays(3)->toDateString();
        $yearMonth = substr($mailedAt, 0, 7);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $mailedAt,
            'needs_invoice' => true,
            'needs_mail' => true,
            'invoice_sent' => true,
            'invoice_sent_at' => $mailedAt,
            'mailed_at' => $mailedAt,
            'mail_recipient' => '歷史收件人',
            'invoice_title' => '歷史測試公司',
            'invoice_tax_id' => '87654321',
            'pricing_lines' => [[
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => \App\Support\SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
        ]));

        $this->getJson('/api/admin/mail-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.year_month', $yearMonth)
            ->assertJsonPath('data.sent_month.schedules.0.id', $schedule->id)
            ->assertJsonPath('data.totals.schedule_postage_count', 1);

        $currentMonthResponse = $this->getJson('/api/admin/mail-tracking?year_month='.now()->format('Y-m'))
            ->assertOk();

        $currentMonthScheduleIds = collect($currentMonthResponse->json('data.sent_month.schedules'))
            ->pluck('id');

        $this->assertFalse($currentMonthScheduleIds->contains($schedule->id));
    }
}
