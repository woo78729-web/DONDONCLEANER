<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FundAccount extends Model
{
    public const CODE_DONGDONG = 'dongdong';

    public const CODE_HONGYI = 'hongyi';

    protected $fillable = [
        'code',
        'name',
        'manager_label',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function incomingTransactions(): HasMany
    {
        return $this->hasMany(FundTransaction::class, 'to_account_id');
    }

    public function outgoingTransactions(): HasMany
    {
        return $this->hasMany(FundTransaction::class, 'from_account_id');
    }
}
