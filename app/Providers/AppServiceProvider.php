<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $account = strtolower((string) $request->input('account', 'unknown'));
            $attempts = app()->environment('production') ? 10 : 60;

            return Limit::perMinute($attempts)->by($account.'|'.$request->ip());
        });
    }
}
