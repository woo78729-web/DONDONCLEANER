<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('account', $validated['account'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return $this->error('帳號或密碼錯誤', 401);
        }

        if (! $user->is_active) {
            return $this->error('帳號已停用', 403);
        }

        $token = $user->createToken('api-token')->plainTextToken;

        return $this->success([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'account' => $user->account,
                'name' => $user->name,
                'role' => $user->role,
                'is_active' => $user->is_active,
            ],
        ], '登入成功');
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(null, '登出成功');
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->success([
            'id' => $user->id,
            'account' => $user->account,
            'name' => $user->name,
            'role' => $user->role,
            'is_active' => $user->is_active,
        ], '取得使用者資訊成功');
    }
}
