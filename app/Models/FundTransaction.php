<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FundTransaction extends Model
{
    public const EVENT_CUSTOMER_CASH_IN = 'customer_cash_in';

    public const EVENT_CUSTOMER_REMITTANCE_IN = 'customer_remittance_in';

    public const EVENT_INTERNAL_INVOICE_TAX_PAYABLE = 'internal_invoice_tax_payable';

    public const STATUS_PENDING = 'pending';

    public const STATUS_POSTED = 'posted';

    public const STATUS_REVERSED = 'reversed';

    protected $fillable = [
        'transaction_no',
        'event_type',
        'from_account_id',
        'to_account_id',
        'amount',
        'status',
        'occurred_at',
        'posted_at',
        'idempotency_key',
        'source_type',
        'source_id',
        'meta',
        'created_by',
        'reversal_of_id',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'occurred_at' => 'datetime',
            'posted_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function fromAccount(): BelongsTo
    {
        return $this->belongsTo(FundAccount::class, 'from_account_id');
    }

    public function toAccount(): BelongsTo
    {
        return $this->belongsTo(FundAccount::class, 'to_account_id');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
