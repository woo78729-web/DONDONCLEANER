<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserRole
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next, string $roles): Response
    {
        $user = $request->user();
        $delimiter = str_contains($roles, '|') ? '|' : ',';
        $allowedRoles = array_values(array_filter(array_map('trim', explode($delimiter, $roles))));

        if (! $user || ! in_array($user->role, $allowedRoles, true)) {
            return response()->json([
                'status' => 'error',
                'message' => '無權限存取此資源',
                'data' => null,
            ], 403);
        }

        if (! $user->is_active) {
            return response()->json([
                'status' => 'error',
                'message' => '帳號已停用',
                'data' => null,
            ], 403);
        }

        return $next($request);
    }
}
