<?php

namespace App\Http\Controllers\Employee;

use App\Http\Controllers\Controller;
use App\Models\CleaningProject;
use App\Support\CleaningProjectSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $projects = CleaningProject::query()
            ->whereHas('employees', fn ($query) => $query->where('users.id', $request->user()->id))
            ->whereNot('status', CleaningProject::STATUS_CLOSED)
            ->with(['employees:id,name'])
            ->orderByDesc('planned_start_date')
            ->get();

        return $this->success([
            'projects' => $projects->map(
                fn (CleaningProject $project) => CleaningProjectSupport::payload($project)
            )->values(),
            'status_labels' => CleaningProjectSupport::statusLabels(),
        ], '專案列表查詢成功');
    }
}
