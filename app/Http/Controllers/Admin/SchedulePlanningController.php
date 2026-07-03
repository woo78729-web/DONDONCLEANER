<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use App\Models\EmployeeLeave;
use App\Models\User;
use App\Support\SchedulePlanningSupport;
use App\Support\TaitungServiceArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SchedulePlanningController extends Controller
{
    public function availability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'areas' => ['nullable', 'string', 'max:500'],
            'days' => ['nullable', 'integer', 'min:1', 'max:60'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $areas = $this->parseAreas($validated['areas'] ?? null);
        $days = (int) ($validated['days'] ?? 14);

        $employees = User::query()
            ->where('role', 'employee')
            ->where('is_active', true)
            ->when(! empty($validated['user_id']), fn ($query) => $query->where('id', $validated['user_id']))
            ->orderBy('name')
            ->get(['id', 'name', 'account']);

        $dateFrom = now()->toDateString();
        $dateTo = now()->addDays($days)->toDateString();

        $schedules = DailySchedule::query()
            ->whereDate('work_date', '>=', $dateFrom)
            ->whereDate('work_date', '<=', $dateTo)
            ->when(! empty($validated['user_id']), fn ($query) => $query->where('user_id', $validated['user_id']))
            ->orderBy('work_date')
            ->orderBy('start_time')
            ->get();

        $leaves = EmployeeLeave::query()
            ->with('user:id,name,account')
            ->when(! empty($validated['user_id']), fn ($query) => $query->where('user_id', $validated['user_id']))
            ->get();

        return $this->success(
            SchedulePlanningSupport::buildAvailability($employees, $schedules, $leaves, $areas, $days),
            '排班空檔查詢成功'
        );
    }

    public function leaves(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $dateFrom = $validated['date_from'] ?? now()->startOfMonth()->toDateString();
        $dateTo = $validated['date_to'] ?? now()->addMonths(2)->endOfMonth()->toDateString();

        $leaves = EmployeeLeave::query()
            ->with('user:id,name,account')
            ->when(! empty($validated['user_id']), fn ($query) => $query->where('user_id', $validated['user_id']))
            ->where(function ($query) use ($dateFrom, $dateTo) {
                $query
                    ->where('leave_type', EmployeeLeave::TYPE_WEEKLY)
                    ->orWhere(function ($inner) use ($dateFrom, $dateTo) {
                        $inner
                            ->where('leave_type', EmployeeLeave::TYPE_DATE)
                            ->whereDate('leave_date', '>=', $dateFrom)
                            ->whereDate('leave_date', '<=', $dateTo);
                    });
            })
            ->orderBy('user_id')
            ->orderBy('leave_date')
            ->get()
            ->map(fn (EmployeeLeave $leave) => SchedulePlanningSupport::leavePayload($leave));

        return $this->success([
            'leaves' => $leaves,
        ], '假期查詢成功');
    }

    /**
     * @return array<int, string>
     */
    private function parseAreas(?string $areas): array
    {
        if ($areas === null || trim($areas) === '') {
            return [];
        }

        $allowed = TaitungServiceArea::values();

        return array_values(array_filter(array_map('trim', explode(',', $areas)), fn ($area) => in_array($area, $allowed, true)));
    }
}
