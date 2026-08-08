<?php

namespace App\Http\Controllers\Cron;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class SendTomorrowSchedulesController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (! $this->authorized($request)) {
            return $this->error('Unauthorized cron token', 401);
        }

        $dryRun = $request->boolean('dry_run');
        $exitCode = Artisan::call('app:send-tomorrow-schedules', [
            '--dry-run' => $dryRun,
        ]);

        return $this->success([
            'exit_code' => $exitCode,
            'dry_run' => $dryRun,
            'output' => trim(Artisan::output()),
        ], $exitCode === 0 ? '明日班表推播已執行' : '明日班表推播執行完成（含失敗）');
    }

    private function authorized(Request $request): bool
    {
        $secret = (string) config('services.cron.secret');

        if ($secret === '') {
            return false;
        }

        $candidates = [
            (string) $request->bearerToken(),
            (string) $request->header('X-Cron-Secret', ''),
            (string) $request->query('token', ''),
            (string) $request->input('token', ''),
        ];

        foreach ($candidates as $candidate) {
            if ($candidate !== '' && hash_equals($secret, $candidate)) {
                return true;
            }
        }

        return false;
    }
}
