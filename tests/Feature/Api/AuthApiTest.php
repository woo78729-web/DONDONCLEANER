<?php

namespace Tests\Feature\Api;

use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_login_and_logout(): void
    {
        User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $login = $this->postJson('/api/login', [
            'account' => 'admin1',
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'account', 'role']]]);

        $token = $login->json('data.token');

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.account', 'admin1');

        $this->withToken($token)
            ->postJson('/api/logout')
            ->assertOk()
            ->assertJsonPath('message', '登出成功');

        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_inactive_user_cannot_login(): void
    {
        User::query()->create([
            'account' => 'disabled',
            'password' => Hash::make('password123'),
            'name' => '停用帳號',
            'role' => 'employee',
            'is_active' => false,
        ]);

        $this->postJson('/api/login', [
            'account' => 'disabled',
            'password' => 'password123',
        ])->assertForbidden()
            ->assertJsonPath('status', 'error');
    }
}
