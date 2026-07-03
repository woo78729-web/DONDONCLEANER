<?php

namespace Tests\Support;

trait CreatesScheduleTestData
{
    protected function futureWorkDate(int $days = 1): string
    {
        return now()->addDays($days)->toDateString();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function scheduleAttributes(array $overrides = []): array
    {
        return array_merge([
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '測試客戶',
            'customer_address' => '台北市信義區市府路1號',
            'customer_phone' => '0912345678',
            'customer_source' => 'phone',
            'ac_units' => 11,
            'unit_price' => 1000,
            'pricing_lines' => [
                ['ac_units' => 11, 'unit_price' => 1000],
            ],
            'needs_invoice' => false,
            'cleaning_price' => 11000,
            'task_details' => '11台11000',
            'notes' => null,
        ], $overrides);
    }
}
