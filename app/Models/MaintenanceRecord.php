<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'schedule_id',
    'reported_by',
    'assigned_user_id',
    'customer_phone',
    'customer_name',
    'customer_address',
    'fb_display_name',
    'line_display_name',
    'issue_description',
    'status',
    'admin_notes',
    'follow_up_method',
    'requires_compensation',
    'is_warranty_case',
    'service_amount',
    'advance_entry_id',
    'resolved_at',
])]
class MaintenanceRecord extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_RESOLVED = 'resolved';

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(DailySchedule::class, 'schedule_id');
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by')->withTrashed();
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id')->withTrashed();
    }

    public function photos(): HasMany
    {
        return $this->hasMany(MaintenanceRecordPhoto::class);
    }

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
            'service_amount' => 'integer',
            'requires_compensation' => 'boolean',
            'is_warranty_case' => 'boolean',
        ];
    }
}
