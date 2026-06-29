<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();

        $schedules = DailySchedule::query()
            ->with('dailyReport')
            ->where('user_id', $request->user()->id)
            ->where(function ($query) use ($today, $tomorrow) {
                $query->whereDate('work_date', $today)
                    ->orWhereDate('work_date', $tomorrow);
            })
            ->orderBy('work_date')
            ->orderBy('id')
            ->get();

        return $this->success([
            'date_range' => [
                'today' => $today,
                'tomorrow' => $tomorrow,
            ],
            'schedules' => $schedules,
        ], '班表查詢成功');
    }
}
