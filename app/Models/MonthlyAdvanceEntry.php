<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'year_month',
    'partner',
    'label',
    'amount',
    'notes',
])]
class MonthlyAdvanceEntry extends Model
{
}
