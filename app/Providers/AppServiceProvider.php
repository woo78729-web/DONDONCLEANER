<?php

namespace App\Providers;

use App\Console\Commands\BackfillFundLedger;
use App\Console\Commands\BackfillMonthlyFixedExpenses;
use App\Console\Commands\ConsolidateProjectSettlement;
use App\Console\Commands\DedupeProjectRemittances;
use App\Console\Commands\EnsureAdminAccount;
use App\Console\Commands\EnsureDevAccounts;
use App\Console\Commands\ResetBusinessData;
use App\Support\PublicStorageLink;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Application as ArtisanApplication;
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
        ArtisanApplication::starting(function ($artisan): void {
            $artisan->resolve(BackfillMonthlyFixedExpenses::class);
            $artisan->resolve(BackfillFundLedger::class);
            $artisan->resolve(ConsolidateProjectSettlement::class);
            $artisan->resolve(DedupeProjectRemittances::class);
            $artisan->resolve(EnsureAdminAccount::class);
            $artisan->resolve(EnsureDevAccounts::class);
            $artisan->resolve(ResetBusinessData::class);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        PublicStorageLink::ensure();

        RateLimiter::for('login', function (Request $request) {
            $account = strtolower((string) $request->input('account', 'unknown'));
            $attempts = app()->environment('production') ? 10 : 60;

            return Limit::perMinute($attempts)->by($account.'|'.$request->ip());
        });
    }
}
