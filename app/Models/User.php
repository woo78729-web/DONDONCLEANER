<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['account', 'password', 'name', 'phone', 'bank_account', 'clothing_size', 'avatar_path', 'role', 'is_active', 'rules_accepted_at', 'must_change_password', 'google_id', 'google_email'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $appends = ['avatar_url'];

    public function dailySchedules(): HasMany
    {
        return $this->hasMany(DailySchedule::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isEmployee(): bool
    {
        return $this->role === 'employee';
    }

    public function isFinance(): bool
    {
        return $this->role === 'finance';
    }

    public function isCustomerService(): bool
    {
        return $this->role === 'customer_service';
    }

    public function hasPermission(string $permission): bool
    {
        return \App\Support\RolePermission::allows($this->role, $permission);
    }

    public function needsEmployeeOnboarding(): bool
    {
        if (! $this->isEmployee()) {
            return false;
        }

        return $this->rules_accepted_at === null || $this->must_change_password;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'rules_accepted_at' => 'datetime',
        ];
    }

    protected function avatarUrl(): Attribute
    {
        return Attribute::get(function () {
            if (! $this->avatar_path) {
                return null;
            }

            return '/storage/'.ltrim(str_replace('\\', '/', $this->avatar_path), '/');
        });
    }
}
