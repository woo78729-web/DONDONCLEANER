<?php

namespace Tests\Feature\Api;

use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\FundAccount;
use App\Models\FundTransaction;
use App\Models\User;
use App\Support\CompanyRemittanceSupport;
use App\Support\EmployeeReportSupport;
use App\Support\FundLedgerSupport;
use App\Support\FundRoutingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class FundRoutingApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $admin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'account' => 'adminfund',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->employee = User::query()->create([
            'account' => 'empfund',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function test_cash_report_routes_customer_total_to_dongdong_account(): void
    {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
        ]));

        Sanctum::actingAs($this->employee);

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 2000,
            'paid_to_company' => false,
        ])->assertCreated();

        $report = DailyReport::query()->where('schedule_id', $schedule->id)->firstOrFail();
        $dongdong = FundLedgerSupport::accountByCode(FundAccount::CODE_DONGDONG);

        $this->assertNotNull($report->fund_routed_at);
        $this->assertDatabaseHas('fund_transactions', [
            'event_type' => FundTransaction::EVENT_CUSTOMER_CASH_IN,
            'to_account_id' => $dongdong->id,
            'amount' => 2000,
            'source_type' => DailyReport::class,
            'source_id' => $report->id,
        ]);
    }

    public function test_cash_report_with_invoice_creates_internal_tax_payable(): void
    {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'needs_invoice' => true,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2100,
            'unit_price' => 1000,
        ]));

        Sanctum::actingAs($this->employee);

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'has_tax' => true,
            'collected_amount' => 2100,
            'paid_to_company' => false,
        ])->assertCreated();

        $report = DailyReport::query()->where('schedule_id', $schedule->id)->firstOrFail();
        $dongdong = FundLedgerSupport::accountByCode(FundAccount::CODE_DONGDONG);
        $hongyi = FundLedgerSupport::accountByCode(FundAccount::CODE_HONGYI);

        $this->assertSame(2100, FundRoutingService::customerPaidTotal($report));
        $this->assertDatabaseHas('fund_transactions', [
            'event_type' => FundTransaction::EVENT_CUSTOMER_CASH_IN,
            'to_account_id' => $dongdong->id,
            'amount' => 2100,
            'source_id' => $report->id,
        ]);
        $this->assertDatabaseHas('fund_transactions', [
            'event_type' => FundTransaction::EVENT_INTERNAL_INVOICE_TAX_PAYABLE,
            'from_account_id' => $dongdong->id,
            'to_account_id' => $hongyi->id,
            'amount' => 160,
            'source_id' => $report->id,
        ]);
    }

    public function test_remittance_confirm_routes_amount_to_hongyi_account(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
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

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}/confirm")
            ->assertOk();

        $hongyi = FundLedgerSupport::accountByCode(FundAccount::CODE_HONGYI);
        $remittance = CompanyRemittance::query()->findOrFail($remittanceId);

        $this->assertSame($hongyi->id, $remittance->destination_account_id);
        $this->assertNotNull($remittance->fund_transaction_id);
        $this->assertDatabaseHas('fund_transactions', [
            'id' => $remittance->fund_transaction_id,
            'event_type' => FundTransaction::EVENT_CUSTOMER_REMITTANCE_IN,
            'to_account_id' => $hongyi->id,
            'amount' => 2000,
            'source_type' => CompanyRemittance::class,
            'source_id' => $remittanceId,
        ]);
    }

    public function test_transfer_report_does_not_create_cash_inflow(): void
    {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
        ]));

        $report = EmployeeReportSupport::createFromSchedule($schedule, [
            'completed_units' => 11,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ]);

        $this->assertDatabaseMissing('fund_transactions', [
            'event_type' => FundTransaction::EVENT_CUSTOMER_CASH_IN,
            'source_type' => DailyReport::class,
            'source_id' => $report->id,
        ]);
    }

    public function test_fund_routing_is_idempotent_on_report_resubmit(): void
    {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
        ]));

        $report = EmployeeReportSupport::createFromSchedule($schedule, [
            'completed_units' => 11,
            'collected_amount' => 11000,
            'paid_to_company' => false,
        ]);

        FundRoutingService::onReportPosted($report->fresh());
        FundRoutingService::onReportPosted($report->fresh());

        $this->assertSame(1, FundTransaction::query()
            ->where('event_type', FundTransaction::EVENT_CUSTOMER_CASH_IN)
            ->where('source_type', DailyReport::class)
            ->where('source_id', $report->id)
            ->count());
    }

    public function test_hongyi_receivables_include_pending_amount_for_monthly_settlement(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = now()->subDays(5)->toDateString();
        $yearMonth = substr($workDate, 0, 7);
        [$year, $month] = array_map('intval', explode('-', $yearMonth));

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
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

        $receivables = FundLedgerSupport::hongyiReceivablesForMonth($year, $month);

        $this->assertSame(2000, $receivables['expected_amount']);
        $this->assertSame(0, $receivables['confirmed_amount']);
        $this->assertSame(2000, $receivables['pending_amount']);
        $this->assertCount(1, $receivables['items']);
        $this->assertFalse($receivables['items'][0]['is_confirmed']);
    }
}
