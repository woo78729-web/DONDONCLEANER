<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LegacyMonthlyLedger extends Model
{
    protected $fillable = [
        'year_month',
        'performance_group_id',
        'daily_units',
        'units_1500',
        'units_1300',
        'units_1000',
        'total_revenue',
        'gross_profit',
        'net_profit',
        'hongyi_share',
        'source',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'daily_units' => 'array',
            'units_1500' => 'integer',
            'units_1300' => 'integer',
            'units_1000' => 'integer',
            'total_revenue' => 'integer',
            'gross_profit' => 'integer',
            'net_profit' => 'integer',
            'hongyi_share' => 'integer',
        ];
    }

    public function performanceGroup(): BelongsTo
    {
        return $this->belongsTo(PerformanceGroup::class);
    }
}
