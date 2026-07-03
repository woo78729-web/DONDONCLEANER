<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\DevAccountBootstrap;
use App\Support\EmployeeRules;
use App\Support\RolePermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        if (app()->environment('local') && User::query()->count() === 0) {
            DevAccountBootstrap::ensureAccounts();
        }

        $validated = $request->validate([
            'account' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $account = trim($validated['account']);
        $password = trim($validated['password']);

        $user = User::withTrashed()->where('account', $account)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            if (User::query()->count() === 0) {
                return $this->error('系統尚未建立任何帳號，請在伺服器執行：php artisan admin:ensure 帳號 密碼', 401);
            }

            return $this->error('帳號或密碼錯誤', 401);
        }

        if ($user->trashed()) {
            return $this->error('帳號已刪除，請聯絡管理員恢復', 403);
        }

        if (! $user->is_active) {
            return $this->error('帳號已停用', 403);
        }

        $user->tokens()->delete();

        $token = $user->createToken('api-token')->plainTextToken;

        return $this->success([
            'token' => $token,
            'user' => $this->userPayload($user),
        ], '登入成功');
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(null, '登出成功');
    }

    public function me(Request $request): JsonResponse
    {
        return $this->success(
            $this->userPayload($request->user()),
            '取得使用者資訊成功'
        );
    }

    public function employeeRules(Request $request): JsonResponse
    {
        if (! $request->user()->isEmployee()) {
            return $this->error('僅限員工帳號查詢', 403);
        }

        return $this->success(EmployeeRules::content(), '員工守則查詢成功');
    }

    public function acceptRules(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->isEmployee()) {
            return $this->error('僅限員工帳號操作', 403);
        }

        if ($user->rules_accepted_at !== null) {
            return $this->success($this->userPayload($user), '員工守則已確認');
        }

        $user->rules_accepted_at = now();
        $user->save();

        return $this->success($this->userPayload($user->fresh()), '員工守則確認成功');
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            return $this->error('目前密碼不正確', 422);
        }

        $user->password = $validated['password'];
        $user->must_change_password = false;
        $user->save();

        return $this->success($this->userPayload($user->fresh()), '密碼已更新');
    }

    /**
     * @return array<string, mixed>
     */
    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'account' => $user->account,
            'name' => $user->name,
            'role' => $user->role,
            'role_label' => RolePermission::label($user->role),
            'permissions' => RolePermission::forRole($user->role),
            'is_active' => $user->is_active,
            'rules_accepted_at' => $user->rules_accepted_at?->toIso8601String(),
            'must_change_password' => $user->must_change_password,
            'needs_onboarding' => $user->needsEmployeeOnboarding(),
        ];
    }
}
