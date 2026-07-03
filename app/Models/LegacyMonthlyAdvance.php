<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LegacyMonthlyAdvance extends Model
{
    protected $fillable = [
        'year_month',
        'partner',
        'label',
        'amount',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
        ];
    }
}
