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

class ScheduleListApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    public function test_admin_can_list_and_show_schedules(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $reported = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-06-29',
            'customer_address' => '地址A',
            'customer_phone' => '0911111111',
        ]));

        DailyReport::query()->create([
            'schedule_id' => $reported->id,
            'completed_units' => 1,
            'collected_amount' => 11000,
        ]);

        $pending = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-06-30',
            'customer_address' => '地址B',
            'customer_phone' => '0922222222',
            'ac_units' => 14,
            'cleaning_price' => 14000,
            'task_details' => '14台14000',
            'notes' => '備註',
        ]));

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/schedules?has_report=0')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.schedules.0.id', $pending->id);

        $this->getJson('/api/admin/schedules/'.$pending->id)
            ->assertOk()
            ->assertJsonPath('data.customer_address', '地址B')
            ->assertJsonPath('data.user.account', 'emp1');
    }

    public function test_admin_can_search_schedules_by_customer_phone(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-05-10',
            'customer_phone' => '0912345678',
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-06-20',
            'customer_phone' => '0988777666',
        ]));

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/schedules?customer_phone=912345678')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.schedules.0.customer_phone', '0912345678')
            ->assertJsonPath('data.schedules.0.user.name', '員工');
    }

    public function test_admin_create_schedule_applies_invoice_surcharge(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'emp1',
            'password' => Hash::make('password123'),
            'name' => '員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/schedules', [
            'user_id' => $employee->id,
            'work_date' => now()->addDay()->toDateString(),
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '發票客戶',
            'customer_address' => '台北市',
            'customer_phone' => '0911000000',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 2, 'unit_price' => 1500],
            ],
            'needs_invoice' => true,
            'invoice_tax_id' => '12345678',
            'invoice_title' => '測試有限公司',
        ])->assertCreated()
            ->assertJsonPath('data.unit_price', 1500)
            ->assertJsonPath('data.needs_invoice', true)
            ->assertJsonPath('data.invoice_tax_id', '12345678')
            ->assertJsonPath('data.invoice_title', '測試有限公司')
            ->assertJsonPath('data.cleaning_price', 3150);
    }
}
