<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        $employees = User::query()
            ->where('role', 'employee')
            ->orderBy('name')
            ->get(['id', 'account', 'name', 'role', 'is_active', 'created_at']);

        return $this->success($employees, '員工列表查詢成功');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account' => ['required', 'string', 'unique:users,account'],
            'password' => ['required', 'string', 'min:6'],
            'name' => ['required', 'string'],
        ]);

        $user = User::query()->create([
            'account' => $validated['account'],
            'password' => $validated['password'],
            'name' => $validated['name'],
            'role' => 'employee',
            'is_active' => true,
        ]);

        return $this->success([
            'id' => $user->id,
            'account' => $user->account,
            'name' => $user->name,
            'role' => $user->role,
            'is_active' => $user->is_active,
        ], '員工帳號建立成功', 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'employee') {
            return $this->error('只能管理員工帳號', 422);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $user->fill($validated);
        $user->save();

        if (array_key_exists('is_active', $validated) && $validated['is_active'] === false) {
            $user->tokens()->delete();
        }

        return $this->success([
            'id' => $user->id,
            'account' => $user->account,
            'name' => $user->name,
            'role' => $user->role,
            'is_active' => $user->is_active,
        ], $user->is_active ? '員工資料更新成功' : '員工已停用');
    }
}
