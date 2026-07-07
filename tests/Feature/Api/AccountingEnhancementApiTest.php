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

class AccountingEnhancementApiTest extends TestCase
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

    public function test_accounting_summary_auto_adds_postage_and_invoice_tax_advance(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');
        $workDate = now()->toDateString();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'needs_mail' => true,
            'needs_invoice' => true,
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1050,
            'unit_price' => 1000,
            'task_details' => '1台1000=1050',
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'has_tax' => true,
            'needs_receipt_and_mail' => true,
            'temporary_postage' => 28,
            'report_invoice_tax_cost' => 80,
            'collected_amount' => 1050,
            'paid_to_company' => false,
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => $workDate,
        ]);

        $this->assertTrue($schedule->fresh()->needs_mail);

        $response = $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.employees.0.completed_units', 1)
            ->assertJsonPath('data.auto_charges.0.key', 'postage')
            ->assertJsonPath('data.auto_charges.0.amount', 28)
            ->assertJsonPath('data.totals.auto_postage', 28)
            ->assertJsonPath('data.totals.auto_invoice_tax_advance', 80);

        $autoAdvances = $response->json('data.auto_advance_entries');
        $invoiceTaxEntry = collect($autoAdvances)->firstWhere('label', '發票稅金 8%');
        $this->assertNotNull($invoiceTaxEntry);
        $this->assertSame(80, $invoiceTaxEntry['amount']);
        $this->assertSame('hongyi', $invoiceTaxEntry['partner']);
    }

    public function test_accounting_postage_counts_invoice_schedules_without_report_postage(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');
        $workDate = now()->addDay()->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'needs_invoice' => true,
            'invoice_title' => '測試公司',
            'customer_name' => '潘媽',
            'customer_phone' => '0911111111',
            'customer_address' => '950臺東市測試路1號',
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => $workDate,
        ]));

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.auto_charges.0.key', 'postage')
            ->assertJsonPath('data.auto_charges.0.mail_report_count', 1)
            ->assertJsonPath('data.auto_charges.0.amount', 28)
            ->assertJsonPath('data.totals.auto_postage', 28);
    }

    public function test_accounting_counts_multi_address_same_customer_as_one_postage(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');
        $workDate = now()->addDay()->toDateString();

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'needs_invoice' => true,
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'customer_address' => '950臺東市地址一號',
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => $workDate,
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'needs_invoice' => true,
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'customer_address' => '950臺東市地址二號',
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => $workDate,
        ]));

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.auto_charges.0.mail_report_count', 1)
            ->assertJsonPath('data.auto_charges.0.amount', 28);
    }

    public function test_admin_can_create_manual_postage_entry(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');

        $this->postJson('/api/admin/accounting/manual-postage', [
            'mailed_at' => now()->toDateString(),
            'mail_recipient' => '王小姐',
            'mail_phone' => '0912345678',
            'mail_address' => '台北市信義區信義路一段1號',
            'notes' => '發票抬頭更正補寄',
        ])
            ->assertCreated()
            ->assertJsonPath('data.entry.amount', 28)
            ->assertJsonPath('data.entry.mailed_at', now()->toDateString())
            ->assertJsonPath('data.entry.mail_recipient', '王小姐')
            ->assertJsonPath('data.entry.mail_phone', '0912345678')
            ->assertJsonPath('data.entry.notes', '發票抬頭更正補寄');

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.manual_postage_entries.0.notes', '發票抬頭更正補寄')
            ->assertJsonPath('data.auto_charges.0.manual_postage_count', 1)
            ->assertJsonPath('data.auto_charges.0.amount', 28);
    }

    public function test_pending_mail_items_do_not_count_toward_postage(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'invoice_sent' => false,
        ]));

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonMissingPath('data.auto_charges.0');
    }

    public function test_postage_uses_mailed_at_month_not_work_date(): void
    {
        Sanctum::actingAs($this->admin);

        $currentMonth = now()->format('Y-m');
        $previousMonthDate = now()->subMonth()->startOfMonth()->toDateString();
        $previousMonth = now()->subMonth()->format('Y-m');

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'invoice_sent' => true,
            'invoice_sent_at' => now(),
            'mailed_at' => $previousMonthDate,
        ]));

        $this->getJson('/api/admin/accounting?year_month='.$currentMonth)
            ->assertOk()
            ->assertJsonMissingPath('data.auto_charges.0');

        $this->getJson('/api/admin/accounting?year_month='.$previousMonth)
            ->assertOk()
            ->assertJsonPath('data.auto_charges.0.amount', 28);
    }

    public function test_manual_postage_backdated_to_previous_month_counts_there(): void
    {
        Sanctum::actingAs($this->admin);

        $previousMonth = now()->subMonth()->format('Y-m');
        $mailedAt = now()->subMonth()->startOfMonth()->toDateString();

        $this->postJson('/api/admin/accounting/manual-postage', [
            'mailed_at' => $mailedAt,
            'mail_recipient' => '補登客戶',
            'mail_phone' => '0911222333',
            'mail_address' => '台東市補登路1號',
            'notes' => '六月補寄',
        ])->assertCreated();

        $this->getJson('/api/admin/accounting?year_month='.$previousMonth)
            ->assertOk()
            ->assertJsonPath('data.auto_charges.0.manual_postage_count', 1)
            ->assertJsonPath('data.auto_charges.0.amount', 28);

        $this->getJson('/api/admin/accounting?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonMissingPath('data.auto_charges.0');
    }

    public function test_unit_performance_endpoint_returns_yearly_totals(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
            'task_details' => '2台1000=2000',
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 2000,
        ]);

        $year = now()->year;

        $this->getJson('/api/admin/accounting/unit-performance?from_year='.$year.'&to_year='.$year)
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'years',
                    'company_totals',
                    'employees',
                    'year_comparison',
                ],
            ])
            ->assertJsonPath('data.company_totals.0.year_total', 2);
    }

    public function test_settlement_ledger_returns_daily_and_detail_rows_with_matching_totals(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');
        $workDate = now()->toDateString();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
            'task_details' => '2台1000',
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 2,
            'completed_units' => 2,
            'collected_amount' => 2000,
            'paid_to_company' => false,
        ]);

        $response = $this->getJson('/api/admin/accounting/settlement-ledger?year_month='.$yearMonth.'&user_id='.$this->employee->id)
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'year_month',
                    'detail_rows',
                    'daily_rows',
                    'totals' => [
                        'collect_from_employee',
                        'advance_to_employee',
                        'payment_to_finance',
                    ],
                    'employee_summaries',
                ],
            ]);

        $this->assertCount(1, $response->json('data.detail_rows'));
        $this->assertCount(1, $response->json('data.daily_rows'));
        $this->assertSame(800, $response->json('data.totals.collect_from_employee'));
        $this->assertSame(800, $response->json('data.employee_summaries.0.collect_from_employee'));
    }
}
