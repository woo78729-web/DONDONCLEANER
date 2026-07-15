<?php

use App\Http\Controllers\Admin\AccountingController as AdminAccountingController;
use App\Http\Controllers\Admin\CleaningProjectController as AdminCleaningProjectController;
use App\Http\Controllers\Admin\LegacyLedgerController as AdminLegacyLedgerController;
use App\Http\Controllers\Admin\CustomerLookupController;
use App\Http\Controllers\Admin\MaintenanceRecordController;
use App\Http\Controllers\Admin\RemittanceTrackingController;
use App\Http\Controllers\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Admin\SchedulePlanningController as AdminSchedulePlanningController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Employee\MaintenanceReportController as EmployeeMaintenanceReportController;
use App\Http\Controllers\Employee\ReportController as EmployeeReportController;
use App\Http\Controllers\Admin\ScheduleController as AdminScheduleController;
use App\Http\Controllers\Employee\LeaveController as EmployeeLeaveController;
use App\Http\Controllers\Employee\ProjectController as EmployeeProjectController;
use App\Http\Controllers\Employee\ScheduleController as EmployeeScheduleController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::patch('/me/password', [AuthController::class, 'updatePassword']);
    Route::post('/me/accept-rules', [AuthController::class, 'acceptRules']);
    Route::get('/employee/rules', [AuthController::class, 'employeeRules']);
});

Route::middleware(['auth:sanctum', 'role:admin|customer_service'])->prefix('admin')->group(function () {
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::get('/customer-lookup', CustomerLookupController::class);
    Route::get('/projects', [AdminCleaningProjectController::class, 'index']);
    Route::post('/projects', [AdminCleaningProjectController::class, 'store']);
    Route::get('/projects/{project}', [AdminCleaningProjectController::class, 'show']);
    Route::patch('/projects/{project}/status', [AdminCleaningProjectController::class, 'updateStatus']);
    Route::patch('/projects/{project}/units', [AdminCleaningProjectController::class, 'updateUnits']);
    Route::patch('/projects/{project}/assignments', [AdminCleaningProjectController::class, 'updateAssignments']);
    Route::post('/projects/{project}/consolidate-settlement', [AdminCleaningProjectController::class, 'consolidateSettlement']);
    Route::patch('/projects/{project}/schedules/{schedule}/units', [AdminCleaningProjectController::class, 'updateScheduleUnits']);
    Route::delete('/projects/{project}', [AdminCleaningProjectController::class, 'destroy']);
    Route::post('/projects/{project}/supplements', [AdminCleaningProjectController::class, 'storeSupplement']);
    Route::get('/schedules', [AdminScheduleController::class, 'index']);
    Route::get('/planning/availability', [AdminSchedulePlanningController::class, 'availability']);
    Route::get('/planning/leaves', [AdminSchedulePlanningController::class, 'leaves']);
    Route::post('/planning/leaves/toggle', [AdminSchedulePlanningController::class, 'toggleLeave']);
    Route::post('/planning/leaves/batch', [AdminSchedulePlanningController::class, 'batchLeave']);
    Route::delete('/planning/leaves/{employeeLeave}', [AdminSchedulePlanningController::class, 'destroyLeave']);
    Route::get('/schedules/{schedule}', [AdminScheduleController::class, 'show']);
    Route::post('/schedules', [AdminScheduleController::class, 'store']);
    Route::patch('/schedules/{schedule}', [AdminScheduleController::class, 'update']);
    Route::delete('/schedules/{schedule}', [AdminScheduleController::class, 'destroy']);
    Route::patch('/schedules/{schedule}/mail-sent', [MaintenanceRecordController::class, 'markScheduleMailSent']);
    Route::patch('/schedules/{schedule}/mail-tracking', [MaintenanceRecordController::class, 'updateScheduleMailTracking']);
    Route::post('/maintenance-records', [MaintenanceRecordController::class, 'store']);
    Route::patch('/maintenance-records/{maintenanceRecord}', [MaintenanceRecordController::class, 'update']);
    Route::post('/maintenance-records/{maintenanceRecord}/photos', [MaintenanceRecordController::class, 'uploadPhoto']);
    Route::get('/mail-tracking', [MaintenanceRecordController::class, 'mailTracking']);
    Route::get('/mail-tracking/history', [MaintenanceRecordController::class, 'searchMailHistory']);
    Route::post('/mail-tracking/merge', [MaintenanceRecordController::class, 'mergeMailTracking']);
    Route::post('/mail-tracking/unmerge', [MaintenanceRecordController::class, 'unmergeMailTracking']);
    Route::patch('/reports/{report}/mail-sent', [MaintenanceRecordController::class, 'markReportMailSent']);
    Route::patch('/reports/{report}/mail-tracking', [MaintenanceRecordController::class, 'updateReportMailTracking']);
});

Route::middleware(['auth:sanctum', 'role:admin|customer_service|finance'])->prefix('admin')->group(function () {
    Route::get('/maintenance-records', [MaintenanceRecordController::class, 'index']);
    Route::get('/maintenance-records/{maintenanceRecord}', [MaintenanceRecordController::class, 'show']);
    Route::get('/remittance-tracking', [RemittanceTrackingController::class, 'index']);
    Route::get('/remittance-tracking/alerts', [RemittanceTrackingController::class, 'alerts']);
    Route::post('/remittance-tracking/alerts/dismiss', [RemittanceTrackingController::class, 'dismissAlerts']);
    Route::patch('/remittance-tracking/{remittance}/remind', [RemittanceTrackingController::class, 'remind']);
    Route::patch('/remittance-tracking/{remittance}/confirm', [RemittanceTrackingController::class, 'confirm']);
    Route::post('/remittance-tracking/{remittance}/split', [RemittanceTrackingController::class, 'split']);
    Route::patch('/remittance-tracking/{remittance}', [RemittanceTrackingController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    Route::post('/users', [AdminUserController::class, 'store']);
    Route::patch('/users/{user}', [AdminUserController::class, 'update']);
    Route::delete('/users/{user}', [AdminUserController::class, 'destroy']);
    Route::post('/users/{user}/avatar', [AdminUserController::class, 'uploadAvatar']);
    Route::get('/accounting', [AdminAccountingController::class, 'show']);
    Route::get('/accounting/settlement-ledger', [AdminAccountingController::class, 'settlementLedger']);
    Route::get('/accounting/unit-performance', [AdminAccountingController::class, 'unitPerformance']);
    Route::patch('/accounting/settings', [AdminAccountingController::class, 'updateSettings']);
    Route::post('/accounting/advances', [AdminAccountingController::class, 'storeAdvance']);
    Route::patch('/accounting/advances/{advance}', [AdminAccountingController::class, 'updateAdvance']);
    Route::delete('/accounting/advances/{advance}', [AdminAccountingController::class, 'destroyAdvance']);
    Route::post('/accounting/manual-postage', [AdminAccountingController::class, 'storeManualPostage']);
    Route::delete('/accounting/manual-postage/{manualPostage}', [AdminAccountingController::class, 'destroyManualPostage']);
    Route::get('/legacy-ledgers/trends', [AdminLegacyLedgerController::class, 'trends']);
    Route::get('/legacy-ledgers/months', [AdminLegacyLedgerController::class, 'months']);
    Route::get('/legacy-ledgers/month', [AdminLegacyLedgerController::class, 'show']);
    Route::post('/legacy-ledgers/import', [AdminLegacyLedgerController::class, 'import']);
    Route::post('/legacy-ledgers/import-bulk', [AdminLegacyLedgerController::class, 'importBulk']);
    Route::delete('/legacy-ledgers/month', [AdminLegacyLedgerController::class, 'destroy']);
    Route::patch('/reports/{report}', [AdminReportController::class, 'update']);
    Route::get('/reports/unit-change-alerts', [AdminReportController::class, 'unitChangeAlerts']);
    Route::post('/reports/unit-change-alerts/dismiss', [AdminReportController::class, 'dismissUnitChangeAlerts']);
});

Route::middleware(['auth:sanctum', 'role:admin|finance|customer_service'])->prefix('admin')->group(function () {
    Route::get('/reports/export', [AdminReportController::class, 'export']);
    Route::get('/reports', [AdminReportController::class, 'index']);
});

Route::middleware(['auth:sanctum', 'role:employee', 'employee.onboarded'])->prefix('employee')->group(function () {
    Route::get('/projects', [EmployeeProjectController::class, 'index']);
    Route::get('/schedules', [EmployeeScheduleController::class, 'index']);
    Route::get('/leaves', [EmployeeLeaveController::class, 'index']);
    Route::post('/leaves', [EmployeeLeaveController::class, 'store']);
    Route::post('/leaves/batch', [EmployeeLeaveController::class, 'batchStore']);
    Route::delete('/leaves/{employeeLeave}', [EmployeeLeaveController::class, 'destroy']);
    Route::get('/reports/pending', [EmployeeReportController::class, 'pending']);
    Route::get('/reports/history', [EmployeeReportController::class, 'index']);
    Route::get('/reports/summary', [EmployeeReportController::class, 'summary']);
    Route::post('/reports', [EmployeeReportController::class, 'store']);
    Route::get('/maintenance-reports', [EmployeeMaintenanceReportController::class, 'index']);
    Route::post('/maintenance-reports', [EmployeeMaintenanceReportController::class, 'store']);
    Route::patch('/maintenance-reports/{maintenanceRecord}', [EmployeeMaintenanceReportController::class, 'update']);
});
