<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'work_date' => ['required', 'date'],
            'customer_address' => ['required', 'string'],
            'customer_phone' => ['required', 'string'],
            'task_details' => ['required', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        if ($error = $this->validateEmployee($validated['user_id'])) {
            return $error;
        }

        $schedule = DailySchedule::query()->create($validated);

        return $this->success($schedule->load('user:id,name,account'), '班表建立成功', 201);
    }

    public function update(Request $request, DailySchedule $schedule): JsonResponse
    {
        if ($schedule->dailyReport()->exists()) {
            return $this->error('此班表已有回報紀錄，無法編輯', 400);
        }

        $validated = $request->validate([
            'user_id' => ['sometimes', 'integer', 'exists:users,id'],
            'work_date' => ['sometimes', 'date'],
            'customer_address' => ['sometimes', 'string'],
            'customer_phone' => ['sometimes', 'string'],
            'task_details' => ['sometimes', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        if (isset($validated['user_id']) && ($error = $this->validateEmployee($validated['user_id']))) {
            return $error;
        }

        $schedule->fill($validated);
        $schedule->save();

        return $this->success(
            $schedule->fresh()->load('user:id,name,account'),
            '班表更新成功'
        );
    }

    private function validateEmployee(int $userId): ?JsonResponse
    {
        $employee = User::query()
            ->where('id', $userId)
            ->where('role', 'employee')
            ->where('is_active', true)
            ->first();

        if (! $employee) {
            return $this->error('指定的使用者不是有效員工', 422);
        }

        return null;
    }
}
