<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'schedule_id',
    'planned_units',
    'completed_units',
    'skipped_units',
    'skip_reason',
    'unit_mismatch',
    'admin_unit_alert_dismissed_at',
    'has_tax',
    'needs_invoice_and_mail',
    'needs_receipt_and_mail',
    'temporary_request',
    'temporary_postage',
    'travel_allowance',
    'report_invoice_tax_cost',
    'collected_amount',
    'paid_to_company',
    'invoice_sent',
    'invoice_sent_at',
    'mailed_at',
])]
class DailyReport extends Model
{
    public function dailySchedule(): BelongsTo
    {
        return $this->belongsTo(DailySchedule::class, 'schedule_id');
    }

    public function companyRemittance(): HasOne
    {
        return $this->hasOne(CompanyRemittance::class, 'report_id')->oldestOfMany();
    }

    public function companyRemittances(): HasMany
    {
        return $this->hasMany(CompanyRemittance::class, 'report_id');
    }

    protected function casts(): array
    {
        return [
            'paid_to_company' => 'boolean',
            'fund_routed_at' => 'datetime',
            'invoice_sent' => 'boolean',
            'invoice_sent_at' => 'datetime',
            'mailed_at' => 'date:Y-m-d',
            'unit_mismatch' => 'boolean',
            'admin_unit_alert_dismissed_at' => 'datetime',
            'has_tax' => 'boolean',
            'needs_invoice_and_mail' => 'boolean',
            'needs_receipt_and_mail' => 'boolean',
        ];
    }
}
