<?php

namespace Tests\Unit;

use App\Models\MaintenanceRecord;
use App\Models\User;
use App\Support\MaintenanceRecordSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MaintenanceRecordCompensationTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_compensation_due_by_month_sums_assigned_shares(): void
    {
        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
        ]);

        $reporter = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $yearMonth = now()->format('Y-m');

        MaintenanceRecord::query()->create([
            'reported_by' => $reporter->id,
            'assigned_user_id' => $employee->id,
            'customer_phone' => '0911222333',
            'issue_description' => '漏水',
            'status' => MaintenanceRecord::STATUS_RESOLVED,
            'requires_compensation' => true,
            'is_warranty_case' => true,
            'service_amount' => 2000,
            'resolved_at' => now(),
        ]);

        MaintenanceRecord::query()->create([
            'reported_by' => $reporter->id,
            'assigned_user_id' => $employee->id,
            'customer_phone' => '0911222333',
            'issue_description' => '不冷',
            'status' => MaintenanceRecord::STATUS_RESOLVED,
            'requires_compensation' => true,
            'is_warranty_case' => false,
            'service_amount' => 1500,
            'resolved_at' => now(),
        ]);

        $totals = MaintenanceRecordSupport::employeeCompensationDueByMonth($yearMonth);

        $this->assertSame(2500, $totals[$employee->id]);
        $this->assertSame(2500, MaintenanceRecordSupport::employeeCompensationDue($employee->id, $yearMonth));
    }
}
