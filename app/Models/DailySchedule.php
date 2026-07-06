<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'user_id',
    'cleaning_project_id',
    'schedule_kind',
    'work_date',
    'start_time',
    'end_time',
    'customer_name',
    'customer_address',
    'mail_recipient',
    'mail_phone',
    'mail_address',
    'needs_mail',
    'service_area',
    'customer_phone',
    'customer_source',
    'fb_display_name',
    'line_display_name',
    'ac_units',
    'units_allocated',
    'cleaning_price',
    'hongyi_fee',
    'unit_price',
    'needs_invoice',
    'needs_receipt',
    'invoice_charge_customer_tax',
    'invoice_planned_date',
    'invoice_tax_id',
    'invoice_title',
    'mail_tracking_number',
    'mail_merge_group_id',
    'pricing_lines',
    'task_details',
    'notes',
    'invoice_sent',
    'invoice_sent_at',
    'mailed_at',
])]
class DailySchedule extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function cleaningProject(): BelongsTo
    {
        return $this->belongsTo(CleaningProject::class, 'cleaning_project_id');
    }

    public function dailyReport(): HasOne
    {
        return $this->hasOne(DailyReport::class, 'schedule_id');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'needs_invoice' => 'boolean',
            'needs_receipt' => 'boolean',
            'invoice_charge_customer_tax' => 'boolean',
            'invoice_planned_date' => 'date:Y-m-d',
            'needs_mail' => 'boolean',
            'invoice_sent' => 'boolean',
            'invoice_sent_at' => 'datetime',
            'mailed_at' => 'date:Y-m-d',
            'pricing_lines' => 'array',
        ];
    }
}
