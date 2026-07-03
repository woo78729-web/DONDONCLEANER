<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\EmployeeLeave;
use App\Support\SchedulePlanningSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeaveController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $leaves = EmployeeLeave::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (EmployeeLeave $leave) => SchedulePlanningSupport::leavePayload($leave));

        return $this->success([
            'registration_open' => SchedulePlanningSupport::isLeaveRegistrationOpen(),
            'registration_message' => SchedulePlanningSupport::leaveRegistrationMessage(),
            'leaves' => $leaves,
        ], '假期查詢成功');
    }

    public function store(Request $request): JsonResponse
    {
        if (! SchedulePlanningSupport::isLeaveRegistrationOpen()) {
            return $this->error(
                '目前非排假開放時間（每月 '.SchedulePlanningSupport::LEAVE_WINDOW_START_DAY.'–'.SchedulePlanningSupport::LEAVE_WINDOW_END_DAY.' 日）',
                422
            );
        }

        $validated = $request->validate([
            'leave_type' => ['required', Rule::in([EmployeeLeave::TYPE_DATE, EmployeeLeave::TYPE_WEEKLY])],
            'leave_date' => ['nullable', 'date', 'required_if:leave_type,'.EmployeeLeave::TYPE_DATE],
            'weekday' => ['nullable', 'integer', 'min:0', 'max:6', 'required_if:leave_type,'.EmployeeLeave::TYPE_WEEKLY],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        if ($validated['leave_type'] === EmployeeLeave::TYPE_DATE) {
            $leaveDate = $validated['leave_date'];

            if (SchedulePlanningSupport::hasScheduleOnDate((int) $request->user()->id, $leaveDate)) {
                return $this->error('當日已有派工，無法排假', 422);
            }

            $exists = EmployeeLeave::query()
                ->where('user_id', $request->user()->id)
                ->where('leave_type', EmployeeLeave::TYPE_DATE)
                ->whereDate('leave_date', $leaveDate)
                ->exists();

            if ($exists) {
                return $this->error('此日期已登記休假', 422);
            }
        }

        if ($validated['leave_type'] === EmployeeLeave::TYPE_WEEKLY) {
            $exists = EmployeeLeave::query()
                ->where('user_id', $request->user()->id)
                ->where('leave_type', EmployeeLeave::TYPE_WEEKLY)
                ->where('weekday', $validated['weekday'])
                ->exists();

            if ($exists) {
                return $this->error('此固定休息日已登記', 422);
            }
        }

        $leave = EmployeeLeave::query()->create([
            'user_id' => $request->user()->id,
            'leave_type' => $validated['leave_type'],
            'leave_date' => $validated['leave_type'] === EmployeeLeave::TYPE_DATE ? $validated['leave_date'] : null,
            'weekday' => $validated['leave_type'] === EmployeeLeave::TYPE_WEEKLY ? $validated['weekday'] : null,
            'note' => $validated['note'] ?? null,
        ]);

        return $this->success(
            SchedulePlanningSupport::leavePayload($leave->load('user:id,name,account')),
            '排假登記成功',
            201
        );
    }

    public function destroy(Request $request, EmployeeLeave $employeeLeave): JsonResponse
    {
        if ((int) $employeeLeave->user_id !== (int) $request->user()->id) {
            return $this->error('無權限刪除此排假', 403);
        }

        if (! SchedulePlanningSupport::isLeaveRegistrationOpen()) {
            return $this->error(
                '目前非排假開放時間（每月 '.SchedulePlanningSupport::LEAVE_WINDOW_START_DAY.'–'.SchedulePlanningSupport::LEAVE_WINDOW_END_DAY.' 日）',
                422
            );
        }

        $employeeLeave->delete();

        return $this->success(null, '排假已取消');
    }
}
