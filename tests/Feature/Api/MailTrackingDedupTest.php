<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use App\Support\MailTrackingSupport;
use App\Support\SchedulePricing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class MailTrackingDedupTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'account' => 'admin-mail-dedup',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->employee = User::query()->create([
            'account' => 'emp-mail-dedup',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function test_multi_address_dispatch_only_creates_one_pending_mail_tracking_row(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->toDateString();
        $notesMarker = '[多址 1/2·共4離8400]';

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'customer_name' => '多站客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '950臺東市第一站',
            'needs_mail' => true,
            'needs_invoice' => true,
            'pricing_lines' => [[
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            'mail_recipient' => '多站客戶',
            'mail_phone' => '0912345678',
            'mail_address' => '950臺東市寄件地址',
            'notes' => "測試備註 {$notesMarker}",
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'customer_name' => '多站客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '950臺東市第二站',
            'needs_mail' => true,
            'needs_invoice' => true,
            'notes' => '[多址 2/2·共4離8400]',
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(1, 'data.pending.schedules')
            ->assertJsonPath('data.pending.schedules.0.mail_recipient', '多站客戶');
    }

    public function test_multiple_invoiced_pricing_lines_only_create_one_pending_mail_tracking_row(): void
    {
        Sanctum::actingAs($this->admin);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_mail' => true,
            'needs_invoice' => true,
            'pricing_lines' => [
                [
                    'ac_units' => 3,
                    'unit_price' => 1500,
                    'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                    'charge_customer_tax' => true,
                ],
                [
                    'ac_units' => 4,
                    'unit_price' => 1000,
                    'invoice_type' => SchedulePricing::INVOICE_TYPE_TRIPLICATE,
                    'invoice_title' => '測試公司',
                    'invoice_tax_id' => '12345678',
                    'charge_customer_tax' => true,
                ],
            ],
            'mail_recipient' => '測試收件人',
            'mail_phone' => '0988777666',
            'mail_address' => '950臺東市測試路1號',
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(1, 'data.pending.schedules');
    }

    public function test_invoice_without_needs_mail_does_not_create_mail_tracking_row(): void
    {
        Sanctum::actingAs($this->admin);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_mail' => false,
            'needs_invoice' => true,
            'pricing_lines' => [[
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
        ]));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(0, 'data.pending.schedules');
    }

    public function test_store_normalizes_multi_address_follow_up_station_without_mail_tracking(): void
    {
        Sanctum::actingAs($this->admin);

        $payload = [
            'user_id' => $this->employee->id,
            'work_date' => now()->addDay()->toDateString(),
            'start_time' => '14:00',
            'end_time' => '16:00',
            'customer_name' => '多站測試',
            'customer_phone' => '0911000222',
            'customer_address' => '950臺東市第二站',
            'customer_source' => 'phone',
            'needs_mail' => true,
            'needs_invoice' => true,
            'pricing_lines' => [[
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            'multi_address_part' => [
                'index' => 2,
                'total' => 2,
                'segment_units' => 2,
                'group_units' => 4,
                'group_price' => 6300,
            ],
            'notes' => '[多址 2/2·共4離6300]',
        ];

        $response = $this->postJson('/api/admin/schedules', $payload)
            ->assertCreated();

        $schedule = DailySchedule::query()->find($response->json('data.id'));

        $this->assertNotNull($schedule);
        $this->assertFalse($schedule->needs_mail);
        $this->assertFalse($schedule->needs_invoice);
        $this->assertFalse(MailTrackingSupport::scheduleRequiresMailTracking($schedule));
    }

    public function test_store_preserves_invoiced_pricing_line_on_multi_address_follow_up_station(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => now()->addDay()->toDateString(),
            'start_time' => '14:00',
            'end_time' => '18:00',
            'customer_name' => '多站測試',
            'customer_phone' => '0911000222',
            'customer_address' => '950臺東市第二站',
            'customer_source' => 'phone',
            'needs_invoice' => true,
            'pricing_lines' => [[
                'ac_units' => 4,
                'unit_price' => 1000,
                'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                'charge_customer_tax' => true,
            ]],
            'multi_address_part' => [
                'index' => 2,
                'total' => 2,
                'segment_units' => 4,
                'group_units' => 7,
                'group_price' => 7350,
            ],
            'notes' => '[多址 2/2·共7離7350]',
        ])->assertCreated();

        $schedule = DailySchedule::query()->find($response->json('data.id'));

        $this->assertNotNull($schedule);
        $this->assertSame(SchedulePricing::INVOICE_TYPE_DUPLICATE, $schedule->pricing_lines[0]['invoice_type'] ?? null);
        $this->assertTrue((bool) ($schedule->pricing_lines[0]['charge_customer_tax'] ?? false));
        $this->assertStringContainsString('含5%', (string) $schedule->task_details);
    }

    public function test_store_primary_schedule_with_mail_and_invoice_creates_single_mail_contact(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => now()->addDays(2)->toDateString(),
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '王小姐',
            'customer_phone' => '0911222333',
            'customer_address' => '950臺東市寄件路1號',
            'customer_source' => 'phone',
            'needs_mail' => true,
            'pricing_lines' => [
                [
                    'ac_units' => 2,
                    'unit_price' => 1500,
                    'invoice_type' => SchedulePricing::INVOICE_TYPE_DUPLICATE,
                    'charge_customer_tax' => true,
                ],
                [
                    'ac_units' => 1,
                    'unit_price' => 1000,
                    'invoice_type' => SchedulePricing::INVOICE_TYPE_NONE,
                ],
            ],
        ])->assertCreated();

        $schedule = DailySchedule::query()->find($response->json('data.id'));

        $this->assertTrue($schedule->needs_mail);
        $this->assertSame('王小姐', $schedule->mail_recipient);
        $this->assertSame('0911222333', $schedule->mail_phone);
        $this->assertTrue(MailTrackingSupport::scheduleRequiresMailTracking($schedule));

        $this->getJson('/api/admin/mail-tracking')
            ->assertOk()
            ->assertJsonCount(1, 'data.pending.schedules');
    }
}
