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
use Illuminate\Validation\Rule;

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

    public function toggleLeave(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'leave_date' => ['required', 'date'],
            'force' => ['sometimes', 'boolean'],
        ]);

        $user = User::query()->findOrFail($validated['user_id']);

        if (! $user->isEmployee()) {
            return $this->error('僅能為員工排假', 422);
        }

        $leaveDate = $validated['leave_date'];
        $force = (bool) ($validated['force'] ?? false);

        $dateLeave = EmployeeLeave::query()
            ->where('user_id', $user->id)
            ->where('leave_type', EmployeeLeave::TYPE_DATE)
            ->whereDate('leave_date', $leaveDate)
            ->first();

        if ($dateLeave) {
            $result = $this->applyLeaveChange($user, $leaveDate, 'remove');

            if (! $result['success']) {
                return $this->error($result['message'] ?? '取消排假失敗', 422);
            }

            $remainingLeaves = EmployeeLeave::query()
                ->where('user_id', $user->id)
                ->get();

            return $this->success([
                'on_leave' => SchedulePlanningSupport::isOnLeave($remainingLeaves, (int) $user->id, $leaveDate),
                'action' => 'removed',
            ], '已取消當日排假');
        }

        $result = $this->applyLeaveChange($user, $leaveDate, 'add', $force);

        if (! $result['success']) {
            if ($result['needs_confirm'] ?? false) {
                return $this->error($result['message'] ?? '當日已有單，仍要排假請確認', 409);
            }

            return $this->error($result['message'] ?? '排假失敗', 422);
        }

        $leave = EmployeeLeave::query()
            ->with('user:id,name,account')
            ->where('user_id', $user->id)
            ->where('leave_type', EmployeeLeave::TYPE_DATE)
            ->whereDate('leave_date', $leaveDate)
            ->first();

        return $this->success([
            'on_leave' => true,
            'action' => 'added',
            'leave' => $leave ? SchedulePlanningSupport::leavePayload($leave) : null,
        ], '排假已登記', 201);
    }

    public function batchLeave(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.leave_date' => ['required', 'date'],
            'changes.*.action' => ['required', Rule::in(['add', 'remove'])],
            'changes.*.force' => ['sometimes', 'boolean'],
        ]);

        $user = User::query()->findOrFail($validated['user_id']);

        if (! $user->isEmployee()) {
            return $this->error('僅能為員工排假', 422);
        }

        $results = [];

        foreach ($validated['changes'] as $change) {
            $results[] = $this->applyLeaveChange(
                $user,
                $change['leave_date'],
                $change['action'],
                (bool) ($change['force'] ?? false),
            );
        }

        $successCount = count(array_filter($results, fn (array $result) => $result['success']));
        $failureCount = count($results) - $successCount;

        return $this->success([
            'results' => $results,
            'success_count' => $successCount,
            'failure_count' => $failureCount,
        ], $failureCount > 0 ? '部分排假未能儲存' : '排假已儲存');
    }

    public function destroyLeave(EmployeeLeave $employeeLeave): JsonResponse
    {
        $employeeLeave->delete();

        return $this->success(null, '排假已刪除');
    }

    /**
     * @return array<string, mixed>
     */
    private function applyLeaveChange(User $user, string $leaveDate, string $action, bool $force = false): array
    {
        if ($action === 'remove') {
            $dateLeave = EmployeeLeave::query()
                ->where('user_id', $user->id)
                ->where('leave_type', EmployeeLeave::TYPE_DATE)
                ->whereDate('leave_date', $leaveDate)
                ->first();

            if (! $dateLeave) {
                return [
                    'leave_date' => $leaveDate,
                    'action' => 'remove',
                    'success' => true,
                    'skipped' => true,
                ];
            }

            $dateLeave->delete();

            return [
                'leave_date' => $leaveDate,
                'action' => 'remove',
                'success' => true,
            ];
        }

        $existingLeave = EmployeeLeave::query()
            ->where('user_id', $user->id)
            ->where('leave_type', EmployeeLeave::TYPE_DATE)
            ->whereDate('leave_date', $leaveDate)
            ->first();

        if ($existingLeave) {
            return [
                'leave_date' => $leaveDate,
                'action' => 'add',
                'success' => true,
                'skipped' => true,
            ];
        }

        $userLeaves = EmployeeLeave::query()
            ->where('user_id', $user->id)
            ->get();

        if (SchedulePlanningSupport::isOnLeave($userLeaves, (int) $user->id, $leaveDate)) {
            return [
                'leave_date' => $leaveDate,
                'action' => 'add',
                'success' => false,
                'message' => '此日為每週固定休，請先刪除固定休假設定',
            ];
        }

        if (
            SchedulePlanningSupport::hasScheduleOnDate((int) $user->id, $leaveDate)
            && ! $force
        ) {
            return [
                'leave_date' => $leaveDate,
                'action' => 'add',
                'success' => false,
                'needs_confirm' => true,
                'message' => '當日已有單',
            ];
        }

        EmployeeLeave::query()->create([
            'user_id' => $user->id,
            'leave_type' => EmployeeLeave::TYPE_DATE,
            'leave_date' => $leaveDate,
        ]);

        return [
            'leave_date' => $leaveDate,
            'action' => 'add',
            'success' => true,
        ];
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
