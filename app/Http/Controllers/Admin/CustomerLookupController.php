<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\MaintenanceRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerLookupController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $phone = preg_replace('/\s+/', '', (string) $request->validate([
            'phone' => ['required', 'string', 'max:50'],
        ])['phone']);

        $schedules = DailySchedule::query()
            ->with([
                'user:id,name,account,role,is_active,avatar_path',
                'dailyReport:id,schedule_id,completed_units,collected_amount,invoice_sent,invoice_sent_at',
            ])
            ->where('customer_phone', 'like', '%'.$phone.'%')
            ->orderByDesc('work_date')
            ->orderByDesc('start_time')
            ->limit(50)
            ->get();

        $maintenanceRecords = MaintenanceRecord::query()
            ->with([
                'reporter:id,name,account',
                'assignee:id,name,account',
                'photos',
            ])
            ->where('customer_phone', 'like', '%'.$phone.'%')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (MaintenanceRecord $record) => \App\Support\MaintenanceRecordSupport::payload($record, $request->user()));

        return $this->success([
            'phone' => $phone,
            'schedules' => $schedules,
            'maintenance_records' => $maintenanceRecords,
        ], '客戶查詢成功');
    }
}
