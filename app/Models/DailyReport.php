<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'schedule_id',
    'completed_units',
    'collected_amount',
])]
class DailyReport extends Model
{
    public function dailySchedule(): BelongsTo
    {
        return $this->belongsTo(DailySchedule::class, 'schedule_id');
    }
}
