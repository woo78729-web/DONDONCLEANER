<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ClothingSize;
use App\Support\RolePermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['nullable', Rule::in(RolePermission::roles())],
        ]);

        $users = User::query()
            ->when(! empty($validated['role']), fn ($query) => $query->where('role', $validated['role']))
            ->orderBy('role')
            ->orderBy('name')
            ->get([
                'id',
                'account',
                'name',
                'phone',
                'bank_account',
                'clothing_size',
                'avatar_path',
                'role',
                'is_active',
                'google_email',
                'created_at',
            ]);

        return $this->success(
            $users->map(fn (User $user) => $this->staffPayload($user))->values(),
            '人員列表查詢成功'
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account' => ['required', 'string', 'max:50', Rule::unique('users', 'account')->whereNull('deleted_at')],
            'password' => ['required', 'string', 'min:6'],
            'name' => ['required', 'string', 'max:255'],
            'role' => ['required', Rule::in(RolePermission::roles())],
            'phone' => ['nullable', 'string', 'max:50'],
            'bank_account' => ['nullable', 'string', 'max:100'],
            'clothing_size' => ['nullable', Rule::in(ClothingSize::OPTIONS)],
            'google_email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'google_email')->whereNull('deleted_at')],
        ]);

        $user = User::query()->create([
            'account' => trim($validated['account']),
            'password' => $validated['password'],
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
            'bank_account' => $validated['bank_account'] ?? null,
            'clothing_size' => $validated['clothing_size'] ?? null,
            'google_email' => isset($validated['google_email']) ? strtolower(trim($validated['google_email'])) : null,
            'role' => $validated['role'],
            'is_active' => true,
            'rules_accepted_at' => $validated['role'] === 'employee' ? null : now(),
            'must_change_password' => $validated['role'] === 'employee',
        ]);

        return $this->success($this->staffPayload($user), '人員帳號建立成功', 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'account' => ['sometimes', 'string', 'max:50', Rule::unique('users', 'account')->ignore($user->id)->whereNull('deleted_at')],
            'name' => ['sometimes', 'string', 'max:255'],
            'role' => ['sometimes', Rule::in(RolePermission::roles())],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'bank_account' => ['sometimes', 'nullable', 'string', 'max:100'],
            'clothing_size' => ['sometimes', 'nullable', Rule::in(ClothingSize::OPTIONS)],
            'google_email' => ['sometimes', 'nullable', 'email', 'max:255', Rule::unique('users', 'google_email')->ignore($user->id)->whereNull('deleted_at')],
            'password' => ['sometimes', 'string', 'min:6'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $actor = $request->user();

        if ($actor && $actor->id === $user->id) {
            if (array_key_exists('is_active', $validated) && $validated['is_active'] === false) {
                return $this->error('無法停用自己的帳號', 422);
            }

            if (array_key_exists('role', $validated) && $validated['role'] !== $user->role) {
                return $this->error('無法變更自己的角色', 422);
            }
        }

        if (
            array_key_exists('role', $validated)
            && $validated['role'] !== 'admin'
            && $user->role === 'admin'
            && User::query()->where('role', 'admin')->where('is_active', true)->count() <= 1
        ) {
            return $this->error('系統至少需要一位啟用中的管理員', 422);
        }

        if (array_key_exists('is_active', $validated)
            && $validated['is_active'] === false
            && $user->role === 'admin'
            && User::query()->where('role', 'admin')->where('is_active', true)->where('id', '!=', $user->id)->count() === 0
        ) {
            return $this->error('系統至少需要一位啟用中的管理員', 422);
        }

        if (array_key_exists('account', $validated)) {
            $validated['account'] = trim($validated['account']);
        }

        if (array_key_exists('google_email', $validated) && $validated['google_email'] !== null) {
            $validated['google_email'] = strtolower(trim($validated['google_email']));
        }

        if (array_key_exists('password', $validated)) {
            $validated['password'] = Hash::make($validated['password']);

            if ($user->role === 'employee') {
                $validated['must_change_password'] = true;
            }
        }

        $user->fill($validated);
        $user->save();

        if (array_key_exists('is_active', $validated) && $validated['is_active'] === false) {
            $user->tokens()->delete();
        }

        return $this->success(
            $this->staffPayload($user),
            $user->is_active ? '人員資料更新成功' : '人員已停用'
        );
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        if ($actor && $actor->id === $user->id) {
            return $this->error('無法刪除自己的帳號', 422);
        }

        if (
            $user->role === 'admin'
            && User::query()->where('role', 'admin')->where('is_active', true)->where('id', '!=', $user->id)->count() === 0
        ) {
            return $this->error('系統至少需要一位啟用中的管理員', 422);
        }

        $user->tokens()->delete();
        $user->delete();

        return $this->success(null, '帳號已刪除，歷史班表資料仍保留供查詢');
    }

    public function uploadAvatar(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpeg,jpg,png,webp,gif', 'max:2048'],
        ]);

        $file = $validated['avatar'];
        $extension = $file->getClientOriginalExtension() ?: $file->extension();
        $path = $file->storeAs(
            'avatars',
            $user->id.'.'.$extension,
            'public'
        );

        if ($user->avatar_path && $user->avatar_path !== $path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $user->avatar_path = $path;
        $user->save();

        return $this->success($this->staffPayload($user), '頭像上傳成功');
    }

    /**
     * @return array<string, mixed>
     */
    private function staffPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'account' => $user->account,
            'name' => $user->name,
            'phone' => $user->phone,
            'bank_account' => $user->bank_account,
            'clothing_size' => $user->clothing_size,
            'avatar_url' => $user->avatar_url,
            'role' => $user->role,
            'role_label' => RolePermission::label($user->role),
            'permissions' => RolePermission::forRole($user->role),
            'is_active' => $user->is_active,
            'google_email' => $user->google_email,
        ];
    }
}
