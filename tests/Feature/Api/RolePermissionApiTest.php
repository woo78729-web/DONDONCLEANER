<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolePermissionApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_finance_user_can_view_reports_but_not_manage_schedules(): void
    {
        $finance = User::query()->create([
            'account' => 'finance1',
            'password' => Hash::make('password123'),
            'name' => '財務',
            'role' => 'finance',
            'is_active' => true,
        ]);

        Sanctum::actingAs($finance);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonPath('status', 'success');

        $this->getJson('/api/admin/schedules')
            ->assertForbidden()
            ->assertJsonPath('message', '無權限存取此資源');
    }

    public function test_admin_can_create_finance_staff(): void
    {
        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/users', [
            'account' => 'finance2',
            'password' => 'password123',
            'name' => '財務二',
            'role' => 'finance',
        ])->assertCreated()
            ->assertJsonPath('data.role', 'finance')
            ->assertJsonPath('data.role_label', '財務人員');
    }

    public function test_login_returns_permissions_for_role(): void
    {
        User::query()->create([
            'account' => 'finance1',
            'password' => Hash::make('password123'),
            'name' => '財務',
            'role' => 'finance',
            'is_active' => true,
        ]);

        $this->postJson('/api/login', [
            'account' => 'finance1',
            'password' => 'password123',
        ])->assertOk()
            ->assertJsonPath('data.user.role', 'finance')
            ->assertJsonFragment(['permissions' => ['remittance.track', 'reports.view', 'reports.export']]);
    }
}
