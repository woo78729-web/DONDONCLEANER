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

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 1,
            'completed_units' => 1,
            'has_tax' => true,
            'needs_receipt_and_mail' => true,
            'temporary_postage' => 28,
            'report_invoice_tax_cost' => 80,
            'collected_amount' => 1050,
            'paid_to_company' => false,
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
}
