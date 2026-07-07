<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyFixedExpense extends Model
{
    public const KEY_CONTROL = 'expense_control';

    public const KEY_PHONE = 'expense_phone';

    public const KEY_AI = 'expense_ai';

    public const KEY_AD = 'expense_ad';

    /** @var list<string> */
    public const AMOUNT_KEYS = [
        self::KEY_CONTROL,
        self::KEY_PHONE,
        self::KEY_AI,
        self::KEY_AD,
    ];

    protected $fillable = [
        'year_month',
        'expense_control',
        'expense_phone',
        'expense_ai',
        'expense_ad',
    ];

    protected function casts(): array
    {
        return [
            'expense_control' => 'integer',
            'expense_phone' => 'integer',
            'expense_ai' => 'integer',
            'expense_ad' => 'integer',
        ];
    }
}
