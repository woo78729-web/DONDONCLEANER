<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeLeave extends Model
{
    public const TYPE_DATE = 'date';

    public const TYPE_WEEKLY = 'weekly';

    protected $fillable = [
        'user_id',
        'leave_type',
        'leave_date',
        'weekday',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'leave_date' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
