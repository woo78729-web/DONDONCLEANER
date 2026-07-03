<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

#[Fillable([
    'maintenance_record_id',
    'uploaded_by',
    'path',
    'caption',
])]
class MaintenanceRecordPhoto extends Model
{
    protected $appends = ['url'];

    public function maintenanceRecord(): BelongsTo
    {
        return $this->belongsTo(MaintenanceRecord::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by')->withTrashed();
    }

    protected function url(): Attribute
    {
        return Attribute::get(fn () => $this->path
            ? Storage::disk('public')->url($this->path)
            : null);
    }
}
