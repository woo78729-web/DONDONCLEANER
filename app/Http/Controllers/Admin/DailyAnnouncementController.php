<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\DailyAnnouncementSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DailyAnnouncementController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'year_month' => ['nullable', 'date_format:Y-m'],
        ]);

        return $this->success(
            DailyAnnouncementSupport::build(
                $validated['date'] ?? null,
                $validated['year_month'] ?? null,
            ),
            '當日公告查詢成功'
        );
    }
}
