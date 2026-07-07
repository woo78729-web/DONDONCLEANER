<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'project_code',
    'title',
    'status',
    'created_by',
    'customer_name',
    'customer_phone',
    'customer_address',
    'service_area',
    'customer_source',
    'fb_display_name',
    'line_display_name',
    'total_ac_units',
    'pricing_lines',
    'ac_units',
    'unit_price',
    'cleaning_price',
    'needs_invoice',
    'needs_receipt',
    'expects_company_remittance',
    'needs_mail',
    'mail_recipient',
    'mail_phone',
    'mail_address',
    'invoice_tax_id',
    'invoice_title',
    'mail_tracking_number',
    'invoice_sent',
    'invoice_sent_at',
    'planned_start_date',
    'planned_end_date',
    'completed_at',
    'notes',
])]
class CleaningProject extends Model
{
    use SoftDeletes;

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_PENDING_INVOICE = 'pending_invoice';

    public const STATUS_PENDING_PAYMENT = 'pending_payment';

    public const STATUS_CLOSED = 'closed';

    public const SCHEDULE_KIND_REGULAR = 'regular';

    public const SCHEDULE_KIND_ASSIGNMENT = 'assignment';

    public const SCHEDULE_KIND_CALENDAR_BLOCK = 'calendar_block';

    public const SCHEDULE_KIND_SUPPLEMENT = 'supplement';

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'cleaning_project_user')
            ->withPivot(['role', 'assigned_units'])
            ->withTimestamps();
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(DailySchedule::class, 'cleaning_project_id');
    }

    protected function casts(): array
    {
        return [
            'planned_start_date' => 'date:Y-m-d',
            'planned_end_date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
            'invoice_sent_at' => 'datetime',
            'needs_invoice' => 'boolean',
            'needs_receipt' => 'boolean',
            'expects_company_remittance' => 'boolean',
            'needs_mail' => 'boolean',
            'invoice_sent' => 'boolean',
            'pricing_lines' => 'array',
        ];
    }
}
