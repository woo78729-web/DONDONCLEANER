<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleAnnouncementEvent extends Model
{
    public const TYPE_CANCEL = 'cancel';

    protected $fillable = [
        'event_type',
        'schedule_id',
        'actor_user_id',
        'technician_name',
        'customer_source',
        'contact_name',
        'service_area',
        'ac_units',
        'work_date',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'ac_units' => 'integer',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id')->withTrashed();
    }
}
