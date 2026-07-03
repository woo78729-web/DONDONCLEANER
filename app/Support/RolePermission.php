<?php

namespace App\Support;

class RolePermission
{
    public const ROLES = ['admin', 'employee', 'finance', 'customer_service'];

    /**
     * @var array<string, list<string>>
     */
    private const PERMISSIONS = [
        'staff.manage' => ['admin'],
        'schedules.manage' => ['admin', 'customer_service'],
        'phone.lookup' => ['admin', 'customer_service'],
        'maintenance.manage' => ['admin', 'customer_service'],
        'mail.tracking' => ['admin', 'customer_service'],
        'remittance.track' => ['admin', 'customer_service', 'finance'],
        'accounting.manage' => ['admin'],
        'reports.view' => ['admin', 'finance', 'customer_service'],
        'reports.export' => ['admin', 'finance'],
        'employee.schedules' => ['employee'],
        'employee.reports' => ['employee'],
        'employee.maintenance' => ['employee'],
    ];

    /**
     * @var array<string, string>
     */
    private const LABELS = [
        'admin' => '管理員',
        'employee' => '員工',
        'finance' => '財務人員',
        'customer_service' => '客服',
    ];

    /**
     * @return list<string>
     */
    public static function roles(): array
    {
        return self::ROLES;
    }

    public static function label(string $role): string
    {
        return self::LABELS[$role] ?? $role;
    }

    /**
     * @return list<string>
     */
    public static function forRole(string $role): array
    {
        $permissions = [];

        foreach (self::PERMISSIONS as $permission => $roles) {
            if (in_array($role, $roles, true)) {
                $permissions[] = $permission;
            }
        }

        return $permissions;
    }

    public static function allows(string $role, string $permission): bool
    {
        return in_array($role, self::PERMISSIONS[$permission] ?? [], true);
    }

    /**
     * @return array<string, list<string>>
     */
    public static function matrix(): array
    {
        return self::PERMISSIONS;
    }
}
