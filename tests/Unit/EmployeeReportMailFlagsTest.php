<?php

namespace Tests\Unit;

use App\Models\DailySchedule;
use App\Models\User;
use App\Support\EmployeeReportSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class EmployeeReportMailFlagsTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    public function test_invoice_schedule_corrects_receipt_mail_flags_on_report(): void
    {
        $employee = User::query()->create([
            'account' => 'emp-mail-flag',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1500]],
            'cleaning_price' => 3000,
            'task_details' => '2台1500=3000',
            'needs_mail' => true,
            'needs_invoice' => true,
            'needs_receipt' => false,
            'invoice_title' => '鴻庭不動產仲介有限公司',
            'invoice_tax_id' => '28914152',
        ]));

        $payload = EmployeeReportSupport::buildFromSchedule($schedule, [
            'completed_units' => 2,
            'needs_invoice_and_mail' => false,
            'needs_receipt_and_mail' => true,
            'collected_amount' => 3000,
        ]);

        $this->assertTrue($payload['needs_invoice_and_mail']);
        $this->assertFalse($payload['needs_receipt_and_mail']);
    }

    public function test_mail_only_schedule_defaults_to_receipt_mail_when_unspecified(): void
    {
        $employee = User::query()->create([
            'account' => 'emp-mail-only',
            'password' => Hash::make('password123'),
            'name' => '師傅',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => now()->toDateString(),
            'ac_units' => 2,
            'pricing_lines' => [['ac_units' => 2, 'unit_price' => 1500]],
            'cleaning_price' => 3000,
            'task_details' => '2台1500=3000',
            'needs_mail' => true,
            'needs_invoice' => false,
            'needs_receipt' => false,
        ]));

        $payload = EmployeeReportSupport::buildFromSchedule($schedule, [
            'completed_units' => 2,
            'collected_amount' => 3000,
        ]);

        $this->assertFalse($payload['needs_invoice_and_mail']);
        $this->assertTrue($payload['needs_receipt_and_mail']);
    }
}
