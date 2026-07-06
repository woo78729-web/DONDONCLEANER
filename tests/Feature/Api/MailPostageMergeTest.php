<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\EmployeeReportSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class MailPostageMergeTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    public function test_same_day_same_recipient_only_charges_postage_once(): void
    {
        $employee = User::query()->create([
            'account' => 'emp-mail',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $workDate = now()->toDateString();

        $firstSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1000]],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'invoice_title' => '鴻庭不動產仲介有限公司',
            'needs_mail' => true,
        ]));

        $secondSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1000]],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'invoice_title' => '鴻庭不動產仲介有限公司',
            'needs_mail' => true,
        ]));

        $firstPayload = EmployeeReportSupport::buildFromSchedule($firstSchedule, [
            'completed_units' => 2,
            'needs_receipt_and_mail' => true,
            'collected_amount' => 2000,
        ]);

        EmployeeReportSupport::createFromSchedule($firstSchedule, [
            'completed_units' => 2,
            'needs_receipt_and_mail' => true,
            'collected_amount' => 2000,
        ]);

        $secondPayload = EmployeeReportSupport::buildFromSchedule($secondSchedule, [
            'completed_units' => 2,
            'needs_receipt_and_mail' => true,
            'collected_amount' => 2000,
        ]);

        $this->assertSame(28, $firstPayload['temporary_postage']);
        $this->assertSame(0, $secondPayload['temporary_postage']);
    }

    public function test_different_recipients_on_same_day_each_charge_postage(): void
    {
        $employee = User::query()->create([
            'account' => 'emp-mail2',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $workDate = now()->toDateString();

        $firstSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1000]],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'invoice_title' => '鴻庭不動產仲介有限公司',
            'needs_mail' => true,
        ]));

        $secondSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1000]],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0911222333',
            'invoice_title' => '陳瑋誼',
            'needs_mail' => true,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $firstSchedule->id,
            ...collect(EmployeeReportSupport::buildFromSchedule($firstSchedule, [
                'completed_units' => 2,
                'needs_receipt_and_mail' => true,
                'collected_amount' => 2000,
            ]))->only([
                'planned_units',
                'completed_units',
                'skipped_units',
                'skip_reason',
                'unit_mismatch',
                'has_tax',
                'needs_invoice_and_mail',
                'needs_receipt_and_mail',
                'temporary_request',
                'temporary_postage',
                'report_invoice_tax_cost',
                'collected_amount',
                'paid_to_company',
            ])->all(),
        ]);

        $secondPayload = EmployeeReportSupport::buildFromSchedule($secondSchedule, [
            'completed_units' => 2,
            'needs_receipt_and_mail' => true,
            'collected_amount' => 2000,
        ]);

        $this->assertSame(28, $secondPayload['temporary_postage']);
    }

    public function test_pending_mail_tracking_merges_same_recipient_rows(): void
    {
        $admin = User::query()->create([
            'account' => 'admin-mail',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp-mail3',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $workDate = now()->toDateString();

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1000]],
            'cleaning_price' => 2000,
            'task_details' => '2台1000=2000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'invoice_title' => '鴻庭不動產仲介有限公司',
            'needs_invoice' => true,
            'needs_mail' => true,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'needs_receipt_and_mail' => true,
            'planned_units' => 2,
            'completed_units' => 2,
            'skipped_units' => 0,
            'unit_mismatch' => false,
            'has_tax' => false,
            'needs_invoice_and_mail' => false,
            'temporary_postage' => 28,
            'collected_amount' => 2000,
            'paid_to_company' => false,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/mail-tracking')->assertOk();

        $this->assertCount(0, $response->json('data.pending.schedules'));
        $this->assertCount(1, $response->json('data.pending.reports'));
    }

    public function test_same_customer_different_addresses_on_same_day_only_charge_postage_once(): void
    {
        $employee = User::query()->create([
            'account' => 'emp-multi',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $workDate = now()->toDateString();

        $firstSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 3,
            'pricing_lines' => [['ac_units' => 3, 'unit_price' => 1000]],
            'cleaning_price' => 3000,
            'task_details' => '3台1000=3000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'customer_address' => '950臺東市地址一號',
            'needs_invoice' => true,
        ]));

        $secondSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'ac_units' => 4,
            'pricing_lines' => [['ac_units' => 4, 'unit_price' => 1000]],
            'cleaning_price' => 4000,
            'task_details' => '4台1000=4000',
            'customer_name' => 'Ching Chem',
            'customer_phone' => '0979518775',
            'customer_address' => '950臺東市地址二號',
            'needs_invoice' => true,
        ]));

        $firstPayload = EmployeeReportSupport::buildFromSchedule($firstSchedule, [
            'completed_units' => 3,
            'collected_amount' => 3000,
        ]);

        EmployeeReportSupport::createFromSchedule($firstSchedule, [
            'completed_units' => 3,
            'collected_amount' => 3000,
        ]);

        $secondPayload = EmployeeReportSupport::buildFromSchedule($secondSchedule, [
            'completed_units' => 4,
            'collected_amount' => 4000,
        ]);

        $this->assertSame(28, $firstPayload['temporary_postage']);
        $this->assertSame(0, $secondPayload['temporary_postage']);
    }

    public function test_cross_day_mail_merge_only_charges_postage_once(): void
    {
        $admin = User::query()->create([
            'account' => 'admin-merge',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp-merge',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $firstSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'customer_phone' => '0911222333',
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1500]],
            'cleaning_price' => 3000,
            'task_details' => '2台1500=3000',
            'needs_invoice' => true,
        ]));

        $secondSchedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'customer_phone' => '0911222333',
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1500]],
            'cleaning_price' => 3000,
            'task_details' => '2台1500=3000',
            'needs_invoice' => true,
        ]));

        EmployeeReportSupport::createFromSchedule($firstSchedule, [
            'completed_units' => 2,
            'needs_invoice_and_mail' => true,
            'collected_amount' => 3000,
        ]);

        EmployeeReportSupport::createFromSchedule($secondSchedule, [
            'completed_units' => 2,
            'needs_invoice_and_mail' => true,
            'collected_amount' => 3000,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/mail-tracking/merge', [
            'schedule_ids' => [$firstSchedule->id, $secondSchedule->id],
        ])->assertOk();

        $firstSchedule->refresh();
        $secondSchedule->refresh();

        $this->assertNotNull($firstSchedule->mail_merge_group_id);
        $this->assertSame($firstSchedule->mail_merge_group_id, $secondSchedule->mail_merge_group_id);

        $firstReport = $firstSchedule->dailyReport()->firstOrFail();
        $secondReport = $secondSchedule->dailyReport()->firstOrFail();

        $this->assertSame(28, (int) $firstReport->temporary_postage);
        $this->assertSame(0, (int) $secondReport->temporary_postage);
    }
}
