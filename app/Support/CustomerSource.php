<?php

namespace App\Support;

class CustomerSource
{
    public const FB = 'fb';

    public const LINE = 'line';

    public const PHONE = 'phone';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return [self::FB, self::LINE, self::PHONE];
    }

    public static function label(string $source): string
    {
        return match ($source) {
            self::FB => 'FB',
            self::LINE => 'LINE',
            self::PHONE => '電聯',
            default => $source,
        };
    }
}
