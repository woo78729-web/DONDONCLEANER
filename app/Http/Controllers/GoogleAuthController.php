<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        if (! config('services.google.client_id') || ! config('services.google.client_secret')) {
            return $this->redirectWithError('Google 登入尚未設定，請聯絡管理員');
        }

        $request->session()->put('google_auth_remember', $request->boolean('remember'));

        return Socialite::driver('google')
            ->scopes(['openid', 'profile', 'email'])
            ->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (\Throwable $exception) {
            Log::warning('Google OAuth callback failed', [
                'message' => $exception->getMessage(),
            ]);

            return $this->redirectWithError('Google 登入失敗，請重試');
        }

        $googleId = (string) $googleUser->getId();
        $email = strtolower(trim((string) ($googleUser->getEmail() ?? '')));

        if ($googleId === '' || $email === '') {
            return $this->redirectWithError('無法取得 Google 帳號資訊');
        }

        $user = User::withTrashed()->where('google_id', $googleId)->first();

        if (! $user) {
            $user = User::withTrashed()
                ->whereRaw('LOWER(google_email) = ?', [$email])
                ->first();

            if ($user && ! $user->trashed() && $user->is_active) {
                $user->google_id = $googleId;

                if (! $user->google_email) {
                    $user->google_email = $email;
                }

                $user->save();
            }
        }

        if (! $user || $user->trashed()) {
            return $this->redirectWithError('此 Google 帳號尚未授權，請聯絡管理員');
        }

        if (! $user->is_active) {
            return $this->redirectWithError('帳號已停用');
        }

        $user->tokens()->delete();

        $token = $user->createToken('api-token')->plainTextToken;
        $remember = (bool) $request->session()->pull('google_auth_remember', false);

        return redirect($this->spaUrl('/login/google-callback', [
            'token' => $token,
            'remember' => $remember ? '1' : '0',
        ]));
    }

    private function redirectWithError(string $message): RedirectResponse
    {
        return redirect($this->spaUrl('/login', [
            'error' => $message,
        ]));
    }

    /**
     * @param  array<string, scalar|null>  $query
     */
    private function spaUrl(string $path, array $query = []): string
    {
        $base = rtrim((string) config('app.url'), '/').'/spa';
        $url = $base.$path;

        if ($query !== []) {
            $url .= '?'.http_build_query($query);
        }

        return $url;
    }
}
