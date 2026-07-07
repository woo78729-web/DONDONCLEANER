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
        'cleaning_project_id',
        'amount',
        'status',
        'expected_remittance_date',
        'reminded_at',
        'confirmed_at',
        'fund_transaction_id',
        'destination_account_id',
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

    public function cleaningProject(): BelongsTo
    {
        return $this->belongsTo(CleaningProject::class, 'cleaning_project_id');
    }

    public function fundTransaction(): BelongsTo
    {
        return $this->belongsTo(FundTransaction::class, 'fund_transaction_id');
    }

    public function destinationAccount(): BelongsTo
    {
        return $this->belongsTo(FundAccount::class, 'destination_account_id');
    }
}
