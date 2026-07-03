<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeOnboardingApiTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::query()->create([
            'account' => 'emp_new',
            'password' => Hash::make('password123'),
            'name' => '新員工',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => null,
            'must_change_password' => true,
        ]);
    }

    public function test_new_employee_login_requires_onboarding(): void
    {
        $this->postJson('/api/login', [
            'account' => 'emp_new',
            'password' => 'password123',
        ])->assertOk()
            ->assertJsonPath('data.user.needs_onboarding', true)
            ->assertJsonPath('data.user.must_change_password', true)
            ->assertJsonPath('data.user.rules_accepted_at', null);
    }

    public function test_employee_cannot_access_schedules_before_onboarding(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/schedules?view=today')
            ->assertForbidden()
            ->assertJsonPath('data.needs_onboarding', true);
    }

    public function test_employee_can_accept_rules_and_update_password(): void
    {
        Sanctum::actingAs($this->employee);

        $this->postJson('/api/me/accept-rules')
            ->assertOk()
            ->assertJsonPath('data.rules_accepted_at', fn ($value) => $value !== null)
            ->assertJsonPath('data.needs_onboarding', true);

        $this->patchJson('/api/me/password', [
            'current_password' => 'password123',
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertOk()
            ->assertJsonPath('data.must_change_password', false)
            ->assertJsonPath('data.needs_onboarding', false);

        $this->getJson('/api/employee/schedules?view=today')->assertOk();
    }

    public function test_employee_can_read_rules_content(): void
    {
        Sanctum::actingAs($this->employee);

        $this->getJson('/api/employee/rules')
            ->assertOk()
            ->assertJsonPath('data.title', '冷氣清洗技師工作守則與規範')
            ->assertJsonStructure(['data' => ['sections']]);
    }
}
