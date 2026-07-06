<?php

namespace Tests\Unit;

use App\Support\MailPostageAccounting;
use PHPUnit\Framework\TestCase;

class MailPostageAccountingTest extends TestCase
{
    public function test_month_bounds_returns_first_and_last_day(): void
    {
        [$start, $end] = MailPostageAccounting::monthBounds(2026, 6);

        $this->assertSame('2026-06-01', $start);
        $this->assertSame('2026-06-30', $end);
    }

    public function test_resolve_mailed_at_defaults_to_today_when_requested(): void
    {
        $today = now()->toDateString();

        $this->assertSame($today, MailPostageAccounting::resolveMailedAt(null, true));
        $this->assertSame('2026-05-15', MailPostageAccounting::resolveMailedAt('2026-05-15', true));
    }

    public function test_resolve_mailed_at_returns_null_without_default(): void
    {
        $this->assertNull(MailPostageAccounting::resolveMailedAt(null, false));
        $this->assertNull(MailPostageAccounting::resolveMailedAt('', false));
    }
}
