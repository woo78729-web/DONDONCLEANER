<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'year_month',
    'mailed_at',
    'amount',
    'mail_recipient',
    'mail_phone',
    'mail_address',
    'notes',
    'created_by',
])]
class ManualPostageEntry extends Model
{
    protected function casts(): array
    {
        return [
            'mailed_at' => 'date:Y-m-d',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
