<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\CompanyRemittanceSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class RemittanceTrackingApiTest extends TestCase
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

    public function test_paid_to_company_report_creates_pending_remittance_and_financial_fields(): void
    {
        Sanctum::actingAs($this->employee);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
        ]));

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ])->assertCreated()
            ->assertJsonPath('data.total_amount', 2000)
            ->assertJsonPath('data.employee_received', 0)
            ->assertJsonPath('data.company_inbound_amount', 2000)
            ->assertJsonPath('data.company_remittance.status', 'pending');

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/remittance-tracking?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.pending.0.amount', 2000)
            ->assertJsonPath('data.totals.pending_amount', 2000);
    }

    public function test_confirmed_remittance_counts_toward_accounting_hongyi_transfer(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2100,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 2,
            'completed_units' => 2,
            'has_tax' => true,
            'collected_amount' => 0,
            'paid_to_company' => true,
            'report_invoice_tax_cost' => 160,
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittanceId = $report->fresh()->companyRemittance->id;

        $yearMonth = now()->format('Y-m');

        $beforeConfirm = $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->json('data.totals');

        $this->assertSame(0, $beforeConfirm['company_transfer']);
        $this->assertSame(160, $beforeConfirm['auto_invoice_tax_advance']);
        $this->assertGreaterThan(0, $beforeConfirm['operating_income']);

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');

        $afterConfirm = $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->json('data.totals');

        $this->assertSame(2100, $afterConfirm['company_transfer']);
        $this->assertSame($beforeConfirm['auto_invoice_tax_advance'], $afterConfirm['auto_invoice_tax_advance']);
        $this->assertSame($beforeConfirm['operating_income'], $afterConfirm['operating_income']);
    }

    public function test_remind_marks_remittance_and_alerts_respect_snooze(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDays(20)->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1000,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'collected_amount' => 0,
            'paid_to_company' => true,
            'created_at' => now()->subDays(20),
            'updated_at' => now()->subDays(20),
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittanceId = $report->fresh()->companyRemittance->id;
        $remittance = $report->fresh()->companyRemittance;
        $remittance->created_at = now()->subDays(20);
        $remittance->saveQuietly();

        $this->getJson('/api/admin/remittance-tracking/alerts')
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}/remind")
            ->assertOk()
            ->assertJsonPath('data.status', 'reminded');

        $this->getJson('/api/admin/remittance-tracking/alerts')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_reminded_without_timestamp_does_not_trigger_alert_until_healed(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDays(20)->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1000,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'collected_amount' => 0,
            'paid_to_company' => true,
            'created_at' => now()->subDays(20),
            'updated_at' => now()->subDays(20),
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittance = $report->fresh()->companyRemittance;
        $remittance->status = \App\Models\CompanyRemittance::STATUS_REMINDED;
        $remittance->reminded_at = null;
        $remittance->created_at = now()->subDays(20);
        $remittance->saveQuietly();

        $this->getJson('/api/admin/remittance-tracking/alerts')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_dismiss_alerts_snoozes_popup_for_one_week(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDays(20)->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1000,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'collected_amount' => 0,
            'paid_to_company' => true,
            'created_at' => now()->subDays(20),
            'updated_at' => now()->subDays(20),
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittanceId = $report->fresh()->companyRemittance->id;
        $remittance = $report->fresh()->companyRemittance;
        $remittance->created_at = now()->subDays(20);
        $remittance->saveQuietly();

        $this->getJson('/api/admin/remittance-tracking/alerts')
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        $this->postJson('/api/admin/remittance-tracking/alerts/dismiss', [
            'remittance_ids' => [$remittanceId],
        ])->assertOk();

        $this->getJson('/api/admin/remittance-tracking/alerts')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_remittance_job_shows_total_amount_advance_and_payout(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'needs_invoice' => true,
            'pricing_lines' => [
                ['ac_units' => 70, 'unit_price' => 1000],
            ],
            'ac_units' => 70,
            'cleaning_price' => 73500,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 70,
            'completed_units' => 70,
            'has_tax' => true,
            'collected_amount' => 0,
            'paid_to_company' => true,
            'report_invoice_tax_cost' => 5600,
        ]);
        CompanyRemittanceSupport::syncForReport($report);

        $this->getJson('/api/admin/accounting?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.employees.0.total_job_amount', 73500)
            ->assertJsonPath('data.employees.0.employee_cash_received', 0)
            ->assertJsonPath('data.employees.0.advance_to_employee', 42000)
            ->assertJsonPath('data.employees.0.company_inbound_expected', 73500)
            ->assertJsonPath('data.employees.0.payout_from_finance', 42000);

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/reports/summary?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.total_job_amount', 73500)
            ->assertJsonPath('data.employee_cash_received', 0)
            ->assertJsonPath('data.advance_from_company_jobs', 42000)
            ->assertJsonPath('data.payment_to_finance', 0)
            ->assertJsonPath('data.payout_from_finance', 42000);
    }

    public function test_mixed_cash_and_remittance_calculates_payment_to_finance(): void
    {
        Sanctum::actingAs($this->employee);

        $cashSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 150, 'unit_price' => 1000],
            ],
            'ac_units' => 150,
            'cleaning_price' => 150000,
            'unit_price' => 1000,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $cashSchedule->id,
            'planned_units' => 150,
            'completed_units' => 150,
            'collected_amount' => 150000,
            'paid_to_company' => false,
        ]);

        $remitSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 50, 'unit_price' => 1000],
            ],
            'ac_units' => 50,
            'cleaning_price' => 50000,
            'unit_price' => 1000,
        ]));

        $remitReport = DailyReport::query()->create([
            'schedule_id' => $remitSchedule->id,
            'planned_units' => 50,
            'completed_units' => 50,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);
        CompanyRemittanceSupport::syncForReport($remitReport);

        $this->getJson('/api/employee/reports/summary?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.remittance_due', 60000)
            ->assertJsonPath('data.advance_from_company_jobs', 30000)
            ->assertJsonPath('data.payment_to_finance', 30000)
            ->assertJsonPath('data.own_amount', 120000);
    }

    public function test_remittance_tracking_backfills_missing_records_for_paid_to_company_reports(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_name' => '匯款客戶',
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 2,
            'completed_units' => 2,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);

        $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.pending.0.amount', 2000)
            ->assertJsonPath('data.totals.pending_amount', 2000);
    }

    public function test_admin_can_update_remittance_dates_for_backfill(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->subMonths(2)->startOfMonth()->toDateString();
        $yearMonth = substr($workDate, 0, 7);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1000,
            'unit_price' => 1000,
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittanceId = $report->fresh()->companyRemittance->id;

        $expectedDate = now()->subMonth()->startOfMonth()->toDateString();
        $confirmedDate = now()->subDays(10)->toDateString();

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}", [
            'expected_remittance_date' => $expectedDate,
            'confirmed_at' => $confirmedDate,
        ])
            ->assertOk()
            ->assertJsonPath('data.expected_remittance_date', $expectedDate)
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.confirmed_at', fn ($value) => str_starts_with((string) $value, $confirmedDate));

        $this->getJson('/api/admin/remittance-tracking?year_month='.substr($expectedDate, 0, 7))
            ->assertOk()
            ->assertJsonPath('data.confirmed.0.amount', 1000)
            ->assertJsonPath('data.totals.confirmed_amount', 1000);
    }

    public function test_project_with_company_remittance_backfills_pending_tracking_records(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->subDays(10)->toDateString();
        $yearMonth = substr($workDate, 0, 7);

        $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $workDate,
            'planned_end_date' => $workDate,
            'customer_name' => '匯款專案客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
        ])->assertCreated();

        $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.pending.0.customer_name', '匯款專案客戶')
            ->assertJsonPath('data.pending.0.status', 'pending')
            ->assertJsonPath('data.pending.0.expected_remittance_date', $workDate)
            ->assertJsonPath('data.totals.pending_amount', 2000);
    }

    public function test_project_with_multiple_schedules_creates_single_remittance_total(): void
    {
        Sanctum::actingAs($this->admin);

        $employeeTwo = User::query()->create([
            'account' => 'emp2',
            'password' => Hash::make('password123'),
            'name' => '員工二',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $start = now()->subDays(10)->toDateString();
        $end = now()->subDays(8)->toDateString();
        $yearMonth = substr($end, 0, 7);

        $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id, $employeeTwo->id],
            'planned_start_date' => $start,
            'planned_end_date' => $end,
            'customer_name' => '多派班匯款客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 4, 'unit_price' => 1000],
            ],
        ])->assertCreated();

        $response = $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk();

        $this->assertCount(1, $response->json('data.pending'));
        $this->assertSame('多派班匯款客戶', $response->json('data.pending.0.customer_name'));
        $this->assertSame(4000, $response->json('data.pending.0.amount'));
        $this->assertSame(4000, $response->json('data.totals.pending_amount'));
    }

    public function test_admin_can_split_project_remittance_into_two_records(): void
    {
        Sanctum::actingAs($this->admin);

        $employeeTwo = User::query()->create([
            'account' => 'emp2split',
            'password' => Hash::make('password123'),
            'name' => '員工二',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $workDate = now()->subDays(10)->toDateString();
        $yearMonth = substr($workDate, 0, 7);

        $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id, $employeeTwo->id],
            'planned_start_date' => $workDate,
            'planned_end_date' => $workDate,
            'customer_name' => '拆帳客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 4, 'unit_price' => 1000],
            ],
        ])->assertCreated();

        $remittanceId = $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->json('data.pending.0.id');

        $this->postJson("/api/admin/remittance-tracking/{$remittanceId}/split", [
            'split_amount' => 1500,
        ])
            ->assertOk()
            ->assertJsonPath('data.original.amount', 2500)
            ->assertJsonPath('data.split.amount', 1500);

        $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.totals.pending_amount', 4000)
            ->assertJsonCount(2, 'data.pending');
    }

    public function test_admin_can_split_project_remittance_three_times(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->subDays(10)->toDateString();
        $yearMonth = substr($workDate, 0, 7);

        $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $workDate,
            'planned_end_date' => $workDate,
            'customer_name' => '三次拆帳客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 14, 'unit_price' => 1000, 'invoice_type' => 'duplicate', 'charge_customer_tax' => true],
            ],
        ])->assertCreated();

        $orderTotal = 14700;
        $firstId = $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.pending.0.amount', $orderTotal)
            ->json('data.pending.0.id');

        $secondId = $this->postJson("/api/admin/remittance-tracking/{$firstId}/split", [
            'split_amount' => 10000,
            'expected_remittance_date' => $workDate,
        ])
            ->assertOk()
            ->assertJsonPath('data.original.amount', 4700)
            ->assertJsonPath('data.split.amount', 10000)
            ->json('data.split.id');

        $this->postJson("/api/admin/remittance-tracking/{$secondId}/split", [
            'split_amount' => 3000,
        ])
            ->assertOk()
            ->assertJsonPath('data.original.amount', 7000)
            ->assertJsonPath('data.split.amount', 3000);

        $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonCount(3, 'data.pending')
            ->assertJsonPath('data.totals.pending_amount', $orderTotal);
    }

    public function test_sync_dedupes_duplicate_project_remittances(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->subDays(10)->toDateString();
        $yearMonth = substr($workDate, 0, 7);

        $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $workDate,
            'planned_end_date' => $workDate,
            'customer_name' => '去重客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 4, 'unit_price' => 1000],
            ],
        ])->assertCreated();

        $project = \App\Models\CleaningProject::query()->first();
        $reports = \App\Models\DailyReport::query()
            ->whereHas('dailySchedule', fn ($query) => $query->where('cleaning_project_id', $project->id))
            ->get();

        foreach ($reports as $report) {
            \App\Models\CompanyRemittance::query()->create([
                'report_id' => $report->id,
                'amount' => 4000,
                'status' => \App\Models\CompanyRemittance::STATUS_PENDING,
            ]);
        }

        CompanyRemittanceSupport::syncForProject($project);

        $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonCount(1, 'data.pending')
            ->assertJsonPath('data.pending.0.amount', 4000);
    }

    public function test_admin_can_update_remittance_amount(): void
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
        ]));

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 2,
            'completed_units' => 2,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);
        CompanyRemittanceSupport::syncForReport($report);
        $remittanceId = $report->fresh()->companyRemittance->id;

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}", [
            'amount' => 1800,
        ])
            ->assertOk()
            ->assertJsonPath('data.amount', 1800);
    }
}
