<?php

namespace Tests\Feature\Api;

use App\Models\CleaningProject;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class ReportFilterApiTest extends TestCase
{
    use CreatesScheduleTestData;
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
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $employeeB = User::query()->create([
            'account' => 'emp2',
            'password' => Hash::make('password123'),
            'name' => '員工B',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
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

    public function test_project_reports_collapse_to_last_date_and_total_units(): void
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
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $employeeB = User::query()->create([
            'account' => 'emp2',
            'password' => Hash::make('password123'),
            'name' => '員工B',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $project = CleaningProject::query()->create([
            'project_code' => 'PRJ-24',
            'status' => CleaningProject::STATUS_IN_PROGRESS,
            'customer_name' => '專案客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市測試路1號',
            'customer_source' => 'phone',
            'total_ac_units' => 24,
            'ac_units' => 24,
            'cleaning_price' => 24000,
            'pricing_lines' => [['ac_units' => 24, 'unit_price' => 1000]],
            'expects_company_remittance' => false,
            'planned_start_date' => '2026-07-28',
            'planned_end_date' => '2026-07-29',
        ]);

        $this->createProjectReport($project, $employeeA, '2026-07-28', 10, 10000);
        $this->createProjectReport($project, $employeeB, '2026-07-29', 14, 14000);
        $this->createReport($employeeA, '2026-07-29', 2, 2000);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/reports?date_from=2026-07-28&date_to=2026-07-29')
            ->assertOk()
            ->assertJsonPath('data.summary.total_reports', 2)
            ->assertJsonPath('data.summary.total_completed_units', 26)
            ->assertJsonPath('data.pagination.total', 2);

        $reports = collect($response->json('data.reports'));
        $projectRow = $reports->firstWhere('is_project_total', true);
        $standalone = $reports->first(fn (array $row) => empty($row['is_project_total']));

        $this->assertNotNull($projectRow);
        $this->assertSame('2026-07-29', substr((string) $projectRow['daily_schedule']['work_date'], 0, 10));
        $this->assertSame(24, $projectRow['completed_units']);
        $this->assertSame('PRJ-24', $projectRow['project_code']);
        $this->assertSame(2, $projectRow['member_report_count']);
        $this->assertSame(2, $standalone['completed_units']);
    }

    private function createReport(User $employee, string $workDate, int $units, int $amount): void
    {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => $units,
            'collected_amount' => $amount,
        ]);
    }

    private function createProjectReport(
        CleaningProject $project,
        User $employee,
        string $workDate,
        int $units,
        int $amount,
    ): void {
        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => $workDate,
            'cleaning_project_id' => $project->id,
            'schedule_kind' => CleaningProject::SCHEDULE_KIND_ASSIGNMENT,
            'ac_units' => $units,
            'cleaning_price' => $amount,
            'pricing_lines' => [['ac_units' => $units, 'unit_price' => 1000]],
        ]));

        DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'planned_units' => $units,
            'completed_units' => $units,
            'collected_amount' => $amount,
        ]);
    }
}
