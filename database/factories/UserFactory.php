<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'account' => fake()->unique()->userName(),
            'name' => fake()->name(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ];
    }

    public function pendingOnboarding(): static
    {
        return $this->state(fn (array $attributes) => [
            'rules_accepted_at' => null,
            'must_change_password' => true,
        ]);
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => 'admin',
        ]);
    }

    public function employee(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => 'employee',
        ]);
    }
}
