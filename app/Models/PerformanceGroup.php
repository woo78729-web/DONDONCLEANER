<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PerformanceGroup extends Model
{
    protected $fillable = [
        'key',
        'label',
        'sort_order',
    ];

    public function legacyLedgers(): HasMany
    {
        return $this->hasMany(LegacyMonthlyLedger::class);
    }
}
