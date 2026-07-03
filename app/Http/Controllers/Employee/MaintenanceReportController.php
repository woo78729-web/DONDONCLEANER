<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\DailySchedule;
use App\Models\MaintenanceRecord;
use App\Models\MaintenanceRecordPhoto;
use App\Support\MaintenanceRecordSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $viewer = $request->user();

        $records = MaintenanceRecord::query()
            ->with(['photos', 'schedule:id,work_date,customer_name'])
            ->where(function ($builder) use ($request) {
                $builder
                    ->where('reported_by', $request->user()->id)
                    ->orWhere('assigned_user_id', $request->user()->id);
            })
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (MaintenanceRecord $record) => MaintenanceRecordSupport::payload($record, $viewer));

        return $this->success(['records' => $records], '維修回報查詢成功');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id' => ['nullable', 'integer', 'exists:daily_schedules,id'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_address' => ['nullable', 'string', 'max:255'],
            'issue_description' => ['required', 'string', 'max:2000'],
            'photos' => ['nullable', 'array', 'max:6'],
            'photos.*' => ['image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $schedule = null;

        if (! empty($validated['schedule_id'])) {
            $schedule = DailySchedule::query()
                ->where('id', $validated['schedule_id'])
                ->where('user_id', $request->user()->id)
                ->first();

            if (! $schedule) {
                return $this->error('找不到對應班表或無權限回報', 404);
            }
        }

        $customerPhone = trim((string) ($validated['customer_phone'] ?? $schedule?->customer_phone ?? ''));

        if ($customerPhone === '') {
            return $this->error('請填寫客戶電話', 422);
        }

        $record = MaintenanceRecord::query()->create([
            'schedule_id' => $schedule?->id,
            'reported_by' => $request->user()->id,
            'assigned_user_id' => $request->user()->id,
            'customer_phone' => $customerPhone,
            'customer_name' => $validated['customer_name'] ?? $schedule?->customer_name,
            'customer_address' => $validated['customer_address'] ?? $schedule?->customer_address,
            'fb_display_name' => $schedule?->fb_display_name,
            'line_display_name' => $schedule?->line_display_name,
            'issue_description' => trim($validated['issue_description']),
            'status' => MaintenanceRecord::STATUS_OPEN,
        ]);

        foreach ($request->file('photos', []) as $index => $file) {
            if (! $file) {
                continue;
            }

            $extension = $file->getClientOriginalExtension() ?: $file->extension();
            $path = $file->storeAs(
                'maintenance-photos/'.$record->id,
                uniqid('photo_', true).'.'.$extension,
                'public'
            );

            MaintenanceRecordPhoto::query()->create([
                'maintenance_record_id' => $record->id,
                'uploaded_by' => $request->user()->id,
                'path' => $path,
                'caption' => '問題照片 '.($index + 1),
            ]);
        }

        return $this->success(
            MaintenanceRecordSupport::payload($record->fresh(), $request->user()),
            '維修回報已送出',
            201
        );
    }

    public function update(Request $request, MaintenanceRecord $maintenanceRecord): JsonResponse
    {
        $userId = $request->user()->id;

        if ($maintenanceRecord->assigned_user_id !== $userId && $maintenanceRecord->reported_by !== $userId) {
            return $this->error('無權限更新此維修紀錄', 403);
        }

        $validated = $request->validate([
            'issue_description' => ['sometimes', 'string', 'max:2000'],
            'follow_up_method' => ['nullable', 'string', 'max:2000'],
            'requires_compensation' => ['sometimes', 'boolean'],
        ]);

        $maintenanceRecord->fill($validated);
        $maintenanceRecord->save();

        return $this->success(
            MaintenanceRecordSupport::payload($maintenanceRecord->fresh(), $request->user()),
            '維修回報已更新'
        );
    }
}
