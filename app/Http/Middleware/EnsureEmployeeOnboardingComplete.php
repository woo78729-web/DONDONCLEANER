<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmployeeOnboardingComplete
{
    public function handle(Request $request, Closure $next): Response|JsonResponse
    {
        $user = $request->user();

        if ($user && $user->needsEmployeeOnboarding()) {
            return response()->json([
                'status' => 'error',
                'message' => '請先完成員工守則閱讀與密碼設定',
                'data' => [
                    'needs_onboarding' => true,
                ],
            ], 403);
        }

        return $next($request);
    }
}
