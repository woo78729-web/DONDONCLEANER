<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportFilterApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_filter_reports_by_work_date_and_user(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employeeA = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工A',
            'role' => 'employee',
            'is_active' => true,
        ]);

        $employeeB = User::query()->create([
            'account' => 'emp2',
            'password' => Hash::make('password123'),
            'name' => '員工B',
            'role' => 'employee',
            'is_active' => true,
        ]);

        $this->createReport($employeeA, '2026-06-29', 2, 22000);
        $this->createReport($employeeA, '2026-06-30', 1, 11000);
        $this->createReport($employeeB, '2026-06-29', 3, 33000);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/reports?date_from=2026-06-29&date_to=2026-06-29&user_id='.$employeeA->id)
            ->assertOk()
            ->assertJsonPath('data.summary.total_reports', 1)
            ->assertJsonPath('data.summary.total_collected_amount', 22000)
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonCount(1, 'data.reports');

        $this->getJson('/api/admin/reports?per_page=2&page=2')
            ->assertOk()
            ->assertJsonPath('data.pagination.current_page', 2)
            ->assertJsonPath('data.pagination.per_page', 2)
            ->assertJsonPath('data.pagination.total', 3)
            ->assertJsonCount(1, 'data.reports');
    }

    private function createReport(User $employee, string $workDate, int $units, int $amount): void
    {
        $schedule = DailySchedule::query()->create([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'customer_address' => '測試地址',
            'customer_phone' => '0912345678',
            'task_details' => '11離11000',
            'notes' => null,
        ]);

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => $units,
            'collected_amount' => $amount,
        ]);
    }
}
