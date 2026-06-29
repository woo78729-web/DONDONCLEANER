<?php

use App\Http\Controllers\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Admin\ScheduleController as AdminScheduleController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Employee\ReportController as EmployeeReportController;
use App\Http\Controllers\Employee\ScheduleController as EmployeeScheduleController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});

Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::post('/users', [AdminUserController::class, 'store']);
    Route::patch('/users/{user}', [AdminUserController::class, 'update']);
    Route::get('/schedules', [AdminScheduleController::class, 'index']);
    Route::get('/schedules/{schedule}', [AdminScheduleController::class, 'show']);
    Route::post('/schedules', [AdminScheduleController::class, 'store']);
    Route::patch('/schedules/{schedule}', [AdminScheduleController::class, 'update']);
    Route::get('/reports/export', [AdminReportController::class, 'export']);
    Route::get('/reports', [AdminReportController::class, 'index']);
});

Route::middleware(['auth:sanctum', 'role:employee'])->prefix('employee')->group(function () {
    Route::get('/schedules', [EmployeeScheduleController::class, 'index']);
    Route::post('/reports', [EmployeeReportController::class, 'store']);
});
