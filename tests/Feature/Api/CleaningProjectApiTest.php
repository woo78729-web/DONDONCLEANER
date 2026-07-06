<?php

namespace Tests\Feature\Api;

use App\Models\CleaningProject;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CleaningProjectApiTest extends TestCase
{
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
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $this->employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工一',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);
    }

    public function test_admin_can_create_project_with_schedules(): void
    {
        Sanctum::actingAs($this->admin);

        $start = now()->addDays(3)->toDateString();
        $end = now()->addDays(5)->toDateString();

        $response = $this->postJson('/api/admin/projects', [
            'title' => '博物館專案',
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $start,
            'planned_end_date' => $end,
            'customer_name' => '測試客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 6, 'unit_price' => 1500],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', CleaningProject::STATUS_IN_PROGRESS)
            ->assertJsonPath('data.progress.total_units', 6);

        $this->assertDatabaseHas('cleaning_projects', [
            'title' => '博物館專案',
            'total_ac_units' => 6,
        ]);

        $this->assertSame(3, CleaningProject::query()->first()->schedules()->count());
    }

    public function test_admin_can_create_project_with_over_99_units(): void
    {
        Sanctum::actingAs($this->admin);

        $start = now()->addDays(3)->toDateString();
        $end = now()->addDays(4)->toDateString();

        $this->postJson('/api/admin/projects', [
            'title' => '大案',
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $start,
            'planned_end_date' => $end,
            'customer_name' => '測試客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'needs_receipt' => true,
            'expects_company_remittance' => true,
            'pricing_lines' => [
                ['ac_units' => 107, 'unit_price' => 1000],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.progress.total_units', 107)
            ->assertJsonPath('data.expects_company_remittance', true)
            ->assertJsonPath('data.needs_receipt', true);
    }

    public function test_admin_can_update_project_units_and_delete_project(): void
    {
        Sanctum::actingAs($this->admin);

        $start = now()->addDays(3)->toDateString();
        $end = now()->addDays(4)->toDateString();

        $projectId = $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $start,
            'planned_end_date' => $end,
            'customer_name' => '測試客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 99, 'unit_price' => 1500],
            ],
        ])->json('data.id');

        $this->patchJson('/api/admin/projects/'.$projectId.'/units', [
            'total_ac_units' => 120,
            'pricing_lines' => [
                ['ac_units' => 120, 'unit_price' => 1500],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.progress.total_units', 120);

        $this->deleteJson('/api/admin/projects/'.$projectId)
            ->assertOk();

        $this->assertSoftDeleted('cleaning_projects', ['id' => $projectId]);
        $this->assertSame(0, DailySchedule::query()->where('cleaning_project_id', $projectId)->count());
    }

    public function test_admin_can_add_supplement_and_update_status(): void
    {
        Sanctum::actingAs($this->admin);

        $project = CleaningProject::query()->create([
            'project_code' => 'PTEST-001',
            'status' => CleaningProject::STATUS_IN_PROGRESS,
            'customer_name' => '客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'total_ac_units' => 10,
            'ac_units' => 10,
            'cleaning_price' => 15000,
            'pricing_lines' => [['ac_units' => 10, 'unit_price' => 1500]],
            'planned_start_date' => now()->addDay()->toDateString(),
            'planned_end_date' => now()->addDays(2)->toDateString(),
        ]);

        $project->employees()->sync([$this->employee->id => ['role' => 'member']]);

        DailySchedule::query()->create([
            'cleaning_project_id' => $project->id,
            'schedule_kind' => CleaningProject::SCHEDULE_KIND_REGULAR,
            'user_id' => $this->employee->id,
            'work_date' => now()->addDay()->toDateString(),
            'start_time' => '09:00',
            'end_time' => '17:00',
            'customer_name' => '客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'pricing_lines' => [['ac_units' => 10, 'unit_price' => 1500]],
            'ac_units' => 10,
            'unit_price' => 1500,
            'cleaning_price' => 15000,
            'task_details' => '10台1500=15000',
        ]);

        $this->postJson('/api/admin/projects/'.$project->id.'/supplements', [
            'user_id' => $this->employee->id,
            'work_date' => now()->addDays(10)->toDateString(),
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1500],
            ],
        ])->assertCreated();

        $project->refresh();
        $this->assertSame(12, (int) $project->total_ac_units);

        $this->patchJson('/api/admin/projects/'.$project->id.'/status', [
            'status' => CleaningProject::STATUS_PENDING_INVOICE,
        ])->assertOk()
            ->assertJsonPath('data.status', CleaningProject::STATUS_PENDING_INVOICE);
    }

    public function test_admin_can_update_individual_schedule_units(): void
    {
        Sanctum::actingAs($this->admin);

        $start = now()->addDays(3)->toDateString();
        $end = now()->addDays(4)->toDateString();

        $projectId = $this->postJson('/api/admin/projects', [
            'employee_ids' => [$this->employee->id],
            'planned_start_date' => $start,
            'planned_end_date' => $end,
            'customer_name' => '測試客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 20, 'unit_price' => 1500],
            ],
        ])->json('data.id');

        $schedule = DailySchedule::query()
            ->where('cleaning_project_id', $projectId)
            ->orderBy('id')
            ->firstOrFail();

        $this->patchJson('/api/admin/projects/'.$projectId.'/schedules/'.$schedule->id.'/units', [
            'ac_units' => 25,
            'unit_price' => 1300,
        ])
            ->assertOk()
            ->assertJsonPath('data.progress.total_units', 35);

        $schedule->refresh();

        $this->assertSame(25, (int) $schedule->ac_units);
        $this->assertSame(1300, (int) $schedule->unit_price);
    }
}
