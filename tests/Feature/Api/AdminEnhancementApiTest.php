<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\CompanyRemittanceSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class AdminEnhancementApiTest extends TestCase
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

    public function test_admin_can_get_accounting_summary(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/accounting?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.fixed_expenses.0.key', 'expense_control')
            ->assertJsonPath('data.fixed_expenses.0.amount', 0)
            ->assertJsonPath('data.fixed_expenses_saved', false)
            ->assertJsonPath('data.fixed_expense_drafts.0.key', 'expense_control')
            ->assertJsonPath('data.totals.atai_advance_fixed_total', 0)
            ->assertJsonStructure([
                'data' => [
                    'employees',
                    'fixed_expenses',
                    'fixed_expense_drafts',
                    'fixed_expenses_saved',
                    'advance_entries',
                    'partner_settlement' => [
                        'basis',
                        'atai',
                        'hongyi',
                    ],
                    'totals' => [
                        'gross_profit',
                        'hongyi_payment',
                        'hongyi_take_home',
                        'atai_take_home',
                    ],
                ],
            ]);
    }

    public function test_accounting_summary_lists_company_transfers_to_hongyi_account(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_name' => '王小姐',
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'ac_units' => 2,
            'cleaning_price' => 2000,
            'unit_price' => 1000,
            'task_details' => '2台1000=2000',
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

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.totals.company_transfer', 2000)
            ->assertJsonPath('data.totals.company_transfer_count', 1)
            ->assertJsonPath('data.company_transfers.0.customer_name', '王小姐')
            ->assertJsonPath('data.company_transfers.0.amount', 2000)
            ->assertJsonPath('data.company_transfers.0.advance_to_employee', 1200);
    }

    public function test_accounting_hongyi_account_matches_remittance_tracking_for_multi_schedule_project(): void
    {
        Sanctum::actingAs($this->admin);

        $employeeTwo = User::query()->create([
            'account' => 'emp2acct',
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

        $remittanceId = $this->getJson('/api/admin/remittance-tracking?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.totals.pending_amount', 4000)
            ->json('data.pending.0.id');

        $this->postJson("/api/admin/remittance-tracking/{$remittanceId}/split", [
            'split_amount' => 1500,
        ])->assertOk();

        $this->patchJson("/api/admin/remittance-tracking/{$remittanceId}/confirm")
            ->assertOk();

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonCount(2, 'data.company_transfers')
            ->assertJsonPath('data.totals.company_inbound_expected', 4000)
            ->assertJsonPath('data.totals.company_transfer', 2500)
            ->assertJsonPath('data.totals.company_transfer_count', 2)
            ->assertJsonPath('data.company_transfers.0.customer_name', '多派班匯款客戶')
            ->assertJsonPath('data.company_transfers.1.customer_name', '多派班匯款客戶');
    }

    public function test_accounting_summary_includes_compensation_due_to_atai(): void
    {
        Sanctum::actingAs($this->admin);

        $yearMonth = now()->format('Y-m');

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'customer_phone' => '0911222333',
        ]));

        $recordId = $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '漏水',
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/admin/maintenance-records/{$recordId}", [
            'status' => 'resolved',
            'requires_compensation' => true,
            'is_warranty_case' => true,
            'service_amount' => 2000,
        ])->assertOk();

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.employees.0.compensation_due_to_atai', 1000)
            ->assertJsonPath('data.totals.compensation_due_to_atai_total', 1000)
            ->assertJsonPath('data.totals.atai_take_home', fn ($value) => is_int($value));
    }

    public function test_employee_can_report_paid_to_company(): void
    {
        Sanctum::actingAs($this->employee);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'ac_units' => 1,
            'cleaning_price' => 1000,
            'unit_price' => 1000,
            'task_details' => '1台1000=1000',
        ]));

        $this->postJson('/api/employee/reports', [
            'schedule_id' => $schedule->id,
            'completed_units' => 1,
            'collected_amount' => 0,
            'paid_to_company' => true,
        ])->assertCreated()
            ->assertJsonPath('data.paid_to_company', true);
    }

    public function test_admin_can_update_employee_contact_fields(): void
    {
        Sanctum::actingAs($this->admin);

        $this->patchJson('/api/admin/users/'.$this->employee->id, [
            'name' => '員工甲',
            'phone' => '0912345678',
            'bank_account' => '822-123456789012',
            'clothing_size' => 'L',
        ])->assertOk()
            ->assertJsonPath('data.name', '員工甲')
            ->assertJsonPath('data.phone', '0912345678')
            ->assertJsonPath('data.bank_account', '822-123456789012')
            ->assertJsonPath('data.clothing_size', 'L');
    }

    public function test_admin_can_upload_employee_avatar(): void
    {
        Sanctum::actingAs($this->admin);

        Storage::fake('public');

        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

        $response = $this->post('/api/admin/users/'.$this->employee->id.'/avatar', [
            'avatar' => UploadedFile::fake()->createWithContent('avatar.png', $png),
        ], [
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', '頭像上傳成功');

        $avatarPath = $response->json('data.avatar_url');
        $this->assertNotNull($avatarPath);

        $this->employee->refresh();
        $this->assertNotNull($this->employee->avatar_path);
        Storage::disk('public')->assertExists($this->employee->avatar_path);
    }

    public function test_admin_can_update_schedule_with_full_payload(): void
    {
        Sanctum::actingAs($this->admin);

        $workDate = $this->futureWorkDate();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'customer_name' => '王小姐',
        ]));

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'user_id' => $this->employee->id,
            'work_date' => $workDate,
            'start_time' => '10:00',
            'end_time' => '12:00',
            'customer_name' => '邱先生',
            'customer_phone' => '0988777666',
            'customer_address' => '新北市三重區',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
            'notes' => '測試備註',
        ])->assertOk()
            ->assertJsonPath('data.customer_name', '邱先生')
            ->assertJsonPath('data.task_details', '1台1000=1000');
    }

    public function test_admin_can_update_schedule_and_deactivate_employee(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_address' => '原始地址',
        ]));

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_address' => '更新後地址',
        ])->assertOk()
            ->assertJsonPath('data.customer_address', '更新後地址');

        $this->employee->createToken('test');
        $this->assertDatabaseCount('personal_access_tokens', 1);

        $this->patchJson('/api/admin/users/'.$this->employee->id, [
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_admin_can_update_schedule_with_existing_report_and_resync_financials(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'customer_address' => '原始地址',
            'ac_units' => 2,
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1000],
            ],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'needs_invoice' => false,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 2,
            'completed_units' => 2,
            'skipped_units' => 0,
            'unit_mismatch' => false,
            'has_tax' => false,
            'collected_amount' => 2000,
            'paid_to_company' => false,
        ]);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'customer_address' => '更新後地址',
            'needs_invoice' => true,
        ])->assertOk()
            ->assertJsonPath('data.customer_address', '更新後地址')
            ->assertJsonPath('data.needs_invoice', true);

        $report = DailyReport::query()->where('schedule_id', $schedule->id)->first();

        $this->assertSame(2, $report->planned_units);
        $this->assertTrue($schedule->fresh()->needs_invoice);
    }

    public function test_admin_schedule_update_recalculates_report_collected_amount(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
            'ac_units' => 6,
            'pricing_lines' => [
                ['ac_units' => 6, 'unit_price' => 1000],
            ],
            'cleaning_price' => 6000,
            'task_details' => '6台1000=6000',
            'needs_invoice' => false,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => 6,
            'completed_units' => 6,
            'skipped_units' => 0,
            'unit_mismatch' => false,
            'has_tax' => false,
            'collected_amount' => 6000,
            'paid_to_company' => false,
        ]);

        $this->patchJson('/api/admin/schedules/'.$schedule->id, [
            'pricing_lines' => [
                ['ac_units' => 4, 'unit_price' => 1000],
            ],
        ])->assertOk()
            ->assertJsonPath('data.cleaning_price', 4000);

        $report = DailyReport::query()->where('schedule_id', $schedule->id)->first();

        $this->assertSame(4, (int) $report->completed_units);
        $this->assertSame(4000, (int) $report->collected_amount);
    }

    public function test_admin_can_export_reports_csv(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => '2026-06-29',
            'customer_address' => '台北市',
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => 2,
            'collected_amount' => 22000,
        ]);

        $response = $this->get('/api/admin/reports/export?date_from=2026-06-29&date_to=2026-06-29');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('清洗台數', $content);
        $this->assertStringContainsString('22000', $content);
        $this->assertStringContainsString('員工', $content);
    }
}
