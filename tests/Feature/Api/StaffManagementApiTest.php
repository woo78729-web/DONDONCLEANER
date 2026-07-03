<?php

namespace Tests\Feature\Api;

use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class StaffManagementApiTest extends TestCase
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

    public function test_admin_can_update_staff_account(): void
    {
        Sanctum::actingAs($this->admin);

        $this->patchJson('/api/admin/users/'.$this->employee->id, [
            'account' => 'emp_new',
        ])->assertOk()
            ->assertJsonPath('data.account', 'emp_new');
    }

    public function test_admin_can_reset_staff_password_to_phone(): void
    {
        $this->employee->phone = '0912345678';
        $this->employee->save();

        Sanctum::actingAs($this->admin);

        $this->patchJson('/api/admin/users/'.$this->employee->id, [
            'password' => '0912345678',
        ])->assertOk();

        $this->employee->refresh();

        $this->assertTrue(Hash::check('0912345678', $this->employee->password));
        $this->assertTrue($this->employee->must_change_password);
    }

    public function test_admin_can_soft_delete_staff_and_keep_schedule_history(): void
    {
        Sanctum::actingAs($this->admin);

        $schedule = DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $this->employee->id,
            'work_date' => now()->toDateString(),
        ]));

        $this->deleteJson('/api/admin/users/'.$this->employee->id)
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $this->employee->id]);
        $this->assertDatabaseHas('daily_schedules', ['id' => $schedule->id, 'user_id' => $this->employee->id]);

        $this->getJson('/api/admin/users?role=employee')
            ->assertOk()
            ->assertJsonMissing(['account' => 'emp1']);

        $this->getJson('/api/admin/schedules?view=calendar&date_from='.now()->toDateString().'&date_to='.now()->toDateString())
            ->assertOk()
            ->assertJsonPath('data.schedules.0.user.name', '員工');
    }

    public function test_deleted_employee_cannot_be_assigned_to_new_schedule(): void
    {
        Sanctum::actingAs($this->admin);

        $this->employee->delete();

        $this->postJson('/api/admin/schedules', [
            'user_id' => $this->employee->id,
            'work_date' => $this->futureWorkDate(),
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_phone' => '0912345678',
            'customer_address' => '台東市',
            'customer_source' => 'phone',
            'pricing_lines' => [
                ['ac_units' => 1, 'unit_price' => 1000],
            ],
        ])->assertStatus(422)
            ->assertJsonPath('message', '指定的使用者不是有效員工');
    }

    public function test_employee_can_update_own_password(): void
    {
        Sanctum::actingAs($this->employee);

        $this->patchJson('/api/me/password', [
            'current_password' => 'password123',
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertOk()
            ->assertJsonPath('message', '密碼已更新')
            ->assertJsonPath('data.must_change_password', false);

        $this->postJson('/api/logout')->assertOk();

        $this->postJson('/api/login', [
            'account' => 'emp1',
            'password' => 'newpass123',
        ])->assertOk();
    }
}
