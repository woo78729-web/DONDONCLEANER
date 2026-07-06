<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyRemittance extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_REMINDED = 'reminded';

    public const STATUS_CONFIRMED = 'confirmed';

    protected $fillable = [
        'report_id',
        'amount',
        'status',
        'expected_remittance_date',
        'reminded_at',
        'confirmed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'expected_remittance_date' => 'date',
            'reminded_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(DailyReport::class, 'report_id');
    }
}
