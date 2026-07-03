<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\EmployeeLeave;
use App\Models\User;
use App\Support\SchedulePlanningSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeaveController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $registration = SchedulePlanningSupport::employeeLeaveRegistration($user);

        $leaves = EmployeeLeave::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (EmployeeLeave $leave) => SchedulePlanningSupport::leavePayload($leave));

        return $this->success([
            'registration_open' => $registration['registration_open'],
            'registration_message' => $registration['registration_message'],
            'allowed_months' => $registration['allowed_months'],
            'default_month' => $registration['default_month'],
            'is_new_employee_window' => $registration['is_new_employee_window'],
            'leaves' => $leaves,
        ], '假期查詢成功');
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! SchedulePlanningSupport::canEmployeeRegisterLeave($user)) {
            return $this->registrationClosedError();
        }

        $validated = $request->validate([
            'leave_type' => ['required', Rule::in([EmployeeLeave::TYPE_DATE, EmployeeLeave::TYPE_WEEKLY])],
            'leave_date' => ['nullable', 'date', 'required_if:leave_type,'.EmployeeLeave::TYPE_DATE],
            'weekday' => ['nullable', 'integer', 'min:0', 'max:6', 'required_if:leave_type,'.EmployeeLeave::TYPE_WEEKLY],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        if ($validated['leave_type'] === EmployeeLeave::TYPE_DATE) {
            $result = $this->applyEmployeeLeaveChange(
                $user,
                $validated['leave_date'],
                'add',
                $validated['note'] ?? null,
            );

            if (! $result['success']) {
                return $this->error($result['message'] ?? '排假登記失敗', 422);
            }

            $leave = EmployeeLeave::query()
                ->with('user:id,name,account')
                ->where('user_id', $user->id)
                ->where('leave_type', EmployeeLeave::TYPE_DATE)
                ->whereDate('leave_date', $validated['leave_date'])
                ->first();

            return $this->success(
                $leave ? SchedulePlanningSupport::leavePayload($leave) : null,
                '排假登記成功',
                201
            );
        }

        $exists = EmployeeLeave::query()
            ->where('user_id', $user->id)
            ->where('leave_type', EmployeeLeave::TYPE_WEEKLY)
            ->where('weekday', $validated['weekday'])
            ->exists();

        if ($exists) {
            return $this->error('此固定休息日已登記', 422);
        }

        $leave = EmployeeLeave::query()->create([
            'user_id' => $user->id,
            'leave_type' => EmployeeLeave::TYPE_WEEKLY,
            'weekday' => $validated['weekday'],
            'note' => $validated['note'] ?? null,
        ]);

        return $this->success(
            SchedulePlanningSupport::leavePayload($leave->load('user:id,name,account')),
            '排假登記成功',
            201
        );
    }

    public function batchStore(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! SchedulePlanningSupport::canEmployeeRegisterLeave($user)) {
            return $this->registrationClosedError();
        }

        $validated = $request->validate([
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.leave_date' => ['required', 'date'],
            'changes.*.action' => ['required', Rule::in(['add', 'remove'])],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $results = [];

        foreach ($validated['changes'] as $change) {
            $results[] = $this->applyEmployeeLeaveChange(
                $user,
                $change['leave_date'],
                $change['action'],
                $validated['note'] ?? null,
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

    public function destroy(Request $request, EmployeeLeave $employeeLeave): JsonResponse
    {
        if ((int) $employeeLeave->user_id !== (int) $request->user()->id) {
            return $this->error('無權限刪除此排假', 403);
        }

        if (! SchedulePlanningSupport::canEmployeeRegisterLeave($request->user())) {
            return $this->registrationClosedError();
        }

        $employeeLeave->delete();

        return $this->success(null, '排假已取消');
    }

    /**
     * @return array<string, mixed>
     */
    private function applyEmployeeLeaveChange(User $user, string $leaveDate, string $action, ?string $note = null): array
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

        if (! SchedulePlanningSupport::isLeaveDateAllowedForEmployee($user, $leaveDate)) {
            return [
                'leave_date' => $leaveDate,
                'action' => 'add',
                'success' => false,
                'message' => '此日期不在開放登記範圍內',
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

        if (SchedulePlanningSupport::hasScheduleOnDate((int) $user->id, $leaveDate)) {
            return [
                'leave_date' => $leaveDate,
                'action' => 'add',
                'success' => false,
                'message' => '當日已有派工，無法排假',
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
                'message' => '此日已有固定休假設定',
            ];
        }

        EmployeeLeave::query()->create([
            'user_id' => $user->id,
            'leave_type' => EmployeeLeave::TYPE_DATE,
            'leave_date' => $leaveDate,
            'note' => $note,
        ]);

        return [
            'leave_date' => $leaveDate,
            'action' => 'add',
            'success' => true,
        ];
    }

    private function registrationClosedError(): JsonResponse
    {
        return $this->error(
            '目前非排假開放時間（每月 '.SchedulePlanningSupport::LEAVE_WINDOW_START_DAY.'–'.SchedulePlanningSupport::LEAVE_WINDOW_END_DAY.' 日，或新人加入後 '.SchedulePlanningSupport::NEW_EMPLOYEE_LEAVE_DAYS.' 天）',
            422
        );
    }
}
