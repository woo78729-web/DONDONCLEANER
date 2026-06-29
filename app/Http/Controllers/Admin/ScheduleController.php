<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => [
                'nullable',
                'date',
                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),
            ],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'has_report' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = DailySchedule::query()
            ->with([
                'user:id,name,account',
                'dailyReport:id,schedule_id,completed_units,collected_amount',
            ])
            ->when(! empty($validated['date_from']), function ($builder) use ($validated) {
                $builder->whereDate('work_date', '>=', $validated['date_from']);
            })
            ->when(! empty($validated['date_to']), function ($builder) use ($validated) {
                $builder->whereDate('work_date', '<=', $validated['date_to']);
            })
            ->when(! empty($validated['user_id']), function ($builder) use ($validated) {
                $builder->where('user_id', $validated['user_id']);
            })
            ->when(array_key_exists('has_report', $validated), function ($builder) use ($validated) {
                if ($validated['has_report']) {
                    $builder->whereHas('dailyReport');
                } else {
                    $builder->whereDoesntHave('dailyReport');
                }
            })
            ->orderByDesc('work_date')
            ->orderByDesc('id');

        $perPage = $validated['per_page'] ?? 15;
        $schedules = $query->paginate(
            $perPage,
            ['*'],
            'page',
            $validated['page'] ?? 1
        );

        return $this->success([
            'filters' => array_filter([
                'date_from' => $validated['date_from'] ?? null,
                'date_to' => $validated['date_to'] ?? null,
                'user_id' => $validated['user_id'] ?? null,
                'has_report' => array_key_exists('has_report', $validated) ? $validated['has_report'] : null,
            ], fn ($value) => $value !== null),
            'schedules' => $schedules->items(),
            'pagination' => [
                'current_page' => $schedules->currentPage(),
                'per_page' => $schedules->perPage(),
                'total' => $schedules->total(),
                'last_page' => $schedules->lastPage(),
            ],
        ], '班表列表查詢成功');
    }

    public function show(DailySchedule $schedule): JsonResponse
    {
        return $this->success(
            $schedule->load([
                'user:id,name,account',
                'dailyReport:id,schedule_id,completed_units,collected_amount',
            ]),
            '班表查詢成功'
        );
    }

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
