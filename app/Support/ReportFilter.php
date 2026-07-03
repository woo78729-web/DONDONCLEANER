<?php

namespace App\Support;

use App\Models\DailyReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportFilter
{
    /**
     * @return array<string, mixed>
     */
    public static function validate(Request $request, bool $includePagination = true): array
    {
        $rules = [
            'date_from' => ['nullable', 'date'],
            'date_to' => [
                'nullable',
                'date',
                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),
            ],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ];

        if ($includePagination) {
            $rules['page'] = ['nullable', 'integer', 'min:1'];
            $rules['per_page'] = ['nullable', 'integer', 'min:1', 'max:100'];
        }

        return $request->validate($rules);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<DailyReport>
     */
    public static function apply(array $filters): Builder
    {
        return DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->with('user:id,name,account'),
                'companyRemittance',
            ])
            ->whereHas('dailySchedule', function ($scheduleQuery) use ($filters) {
                if (! empty($filters['date_from'])) {
                    $scheduleQuery->whereDate('work_date', '>=', $filters['date_from']);
                }

                if (! empty($filters['date_to'])) {
                    $scheduleQuery->whereDate('work_date', '<=', $filters['date_to']);
                }

                if (! empty($filters['user_id'])) {
                    $scheduleQuery->where('user_id', $filters['user_id']);
                }
            })
            ->orderByDesc('created_at');
    }

    /**
     * @return array{total_reports: int, total_completed_units: int, total_collected_amount: int}
     */
    public static function summarize(Builder $query): array
    {
        return [
            'total_reports' => (clone $query)->count(),
            'total_completed_units' => (int) (clone $query)->sum('completed_units'),
            'total_collected_amount' => (int) (clone $query)->sum('collected_amount'),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public static function activeFilters(array $filters): array
    {
        return array_filter([
            'date_from' => $filters['date_from'] ?? null,
            'date_to' => $filters['date_to'] ?? null,
            'user_id' => $filters['user_id'] ?? null,
        ], fn ($value) => $value !== null);
    }
}
