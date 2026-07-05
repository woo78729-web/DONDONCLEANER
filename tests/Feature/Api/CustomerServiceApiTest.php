<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class CustomerServiceApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    private User $customerService;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customerService = User::query()->create([
            'account' => 'cs1',
            'password' => Hash::make('password123'),
            'name' => '客服',
            'role' => 'customer_service',
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

    public function test_customer_service_can_lookup_phone_and_create_schedule(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->addDay()->toDateString(),
            'customer_phone' => '0911222333',
            'fb_display_name' => 'FB小明',
            'line_display_name' => 'LINE小明',
        ]));

        $this->getJson('/api/admin/customer-lookup?phone=0911222')
            ->assertOk()
            ->assertJsonPath('data.schedules.0.id', $schedule->id);

        $this->postJson('/api/admin/maintenance-records', [
            'customer_phone' => '0911222333',
            'issue_description' => '室外機異音',
        ])->assertCreated()
            ->assertJsonPath('data.issue_description', '室外機異音');

        $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '客戶來電反映漏水',
        ])->assertCreated()
            ->assertJsonPath('data.schedule_id', $schedule->id)
            ->assertJsonPath('data.assigned_user_id', $this->employee->id)
            ->assertJsonPath('data.customer_phone', '0911222333');
    }

    public function test_assigned_maintenance_appears_for_employee(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'customer_phone' => '0911222333',
        ]));

        $create = $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '不冷',
        ])->assertCreated();

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/maintenance-reports')
            ->assertOk()
            ->assertJsonPath('data.records.0.issue_description', '不冷')
            ->assertJsonPath('data.records.0.assigned_user_id', $this->employee->id);
    }

    public function test_employee_can_update_follow_up_on_assigned_maintenance(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'customer_phone' => '0911222333',
        ]));

        $create = $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '不冷',
        ])->assertCreated();

        $recordId = $create->json('data.id');

        Sanctum::actingAs($this->employee);

        $this->patchJson("/api/employee/maintenance-reports/{$recordId}", [
            'follow_up_method' => '清洗室外機',
            'requires_compensation' => true,
        ])->assertOk()
            ->assertJsonPath('data.follow_up_method', '清洗室外機')
            ->assertJsonPath('data.requires_compensation', true)
            ->assertJsonMissingPath('data.service_amount');
    }

    public function test_admin_sets_compensation_amount_and_creates_atai_advance(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
            'customer_phone' => '0911222333',
            'customer_name' => '測試客戶',
        ]));

        $create = $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '漏水',
        ])->assertCreated();

        $recordId = $create->json('data.id');

        $this->patchJson("/api/admin/maintenance-records/{$recordId}", [
            'requires_compensation' => true,
            'is_warranty_case' => true,
            'service_amount' => 2000,
        ])
            ->assertOk()
            ->assertJsonPath('data.service_amount', 2000);

        $this->assertDatabaseMissing('monthly_advance_entries', [
            'partner' => 'atai',
            'amount' => 2000,
        ]);

        $this->patchJson("/api/admin/maintenance-records/{$recordId}", [
            'status' => 'resolved',
            'requires_compensation' => true,
            'is_warranty_case' => true,
            'service_amount' => 2000,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.employee_compensation_share', 1000)
            ->assertJsonPath('data.company_compensation_share', 1000);

        $this->assertDatabaseHas('monthly_advance_entries', [
            'partner' => 'atai',
            'amount' => 2000,
        ]);
    }

    public function test_employee_sees_compensation_due_to_atai_after_resolve(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
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
            'is_warranty_case' => false,
            'service_amount' => 3000,
        ])->assertOk()
            ->assertJsonPath('data.employee_compensation_due_to_atai', 3000);

        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/maintenance-reports')
            ->assertOk()
            ->assertJsonPath('data.records.0.employee_compensation_due_to_atai', 3000)
            ->assertJsonMissingPath('data.records.0.service_amount');

        $this->getJson('/api/employee/reports/summary?year_month='.now()->format('Y-m'))
            ->assertOk()
            ->assertJsonPath('data.compensation_due_to_company', 3000);
    }

    public function test_admin_cannot_resolve_compensation_case_without_amount(): void
    {
        Sanctum::actingAs($this->customerService);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->subDay()->toDateString(),
        ]));

        $recordId = $this->postJson('/api/admin/maintenance-records', [
            'schedule_id' => $schedule->id,
            'issue_description' => '漏水',
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/admin/maintenance-records/{$recordId}", [
            'status' => 'resolved',
            'requires_compensation' => true,
            'service_amount' => 0,
        ])->assertStatus(422);
    }

    public function test_employee_can_submit_maintenance_report_with_photo(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->employee);

        $schedule = \App\Models\DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
        ]));

        $this->post('/api/employee/maintenance-reports', [
            'schedule_id' => $schedule->id,
            'issue_description' => '排水異常',
            'photos' => [
                UploadedFile::fake()->create('issue.jpg', 100, 'image/jpeg'),
            ],
        ])->assertCreated()
            ->assertJsonPath('data.issue_description', '排水異常')
            ->assertJsonPath('data.photos.0.url', fn ($url) => is_string($url) && $url !== '');
    }
}
