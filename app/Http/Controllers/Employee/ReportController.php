<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id' => ['required', 'integer', 'exists:daily_schedules,id'],
            'completed_units' => ['required', 'integer', 'min:0'],
            'collected_amount' => ['required', 'integer', 'min:0'],
        ]);

        $schedule = DailySchedule::query()
            ->where('id', $validated['schedule_id'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $schedule) {
            return $this->error('找不到對應班表或無權限回報', 404);
        }

        if ($schedule->dailyReport()->exists()) {
            return $this->error('此班表已有回報紀錄，無法重複填寫', 400);
        }

        $report = DailyReport::query()->create([
            'schedule_id' => $schedule->id,
            'completed_units' => $validated['completed_units'],
            'collected_amount' => $validated['collected_amount'],
        ]);

        return $this->success($report->load('dailySchedule'), '回報提交成功', 201);
    }
}
