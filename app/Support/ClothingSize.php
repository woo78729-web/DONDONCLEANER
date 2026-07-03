<?php

namespace App\Support;

class ClothingSize
{
    public const OPTIONS = [
        'XS',
        'S',
        'M',
        'L',
        'XL',
        '2XL',
        '3XL',
        '4XL',
    ];

    public static function isValid(?string $size): bool
    {
        return $size === null || in_array($size, self::OPTIONS, true);
    }
}
