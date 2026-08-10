<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'year_month',
    'mailed_at',
    'amount',
    'billing_amount',
    'needs_receipt',
    'needs_invoice',
    'invoice_charge_customer_tax',
    'mail_recipient',
    'mail_phone',
    'mail_address',
    'invoice_title',
    'invoice_tax_id',
    'mail_tracking_number',
    'notes',
    'invoice_sent',
    'created_by',
])]
class ManualPostageEntry extends Model
{
    protected function casts(): array
    {
        return [
            'mailed_at' => 'date:Y-m-d',
            'invoice_sent' => 'boolean',
            'needs_receipt' => 'boolean',
            'needs_invoice' => 'boolean',
            'invoice_charge_customer_tax' => 'boolean',
            'amount' => 'integer',
            'billing_amount' => 'integer',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
