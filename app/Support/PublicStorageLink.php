<?php

namespace App\Support;

use Illuminate\Support\Facades\File;

class PublicStorageLink
{
    public static function ensure(): void
    {
        $link = public_path('storage');
        $target = storage_path('app/public');

        File::ensureDirectoryExists($target);

        if (is_link($link)) {
            $resolved = realpath($link);
            $expected = realpath($target);

            if ($resolved !== false && $expected !== false && $resolved === $expected) {
                return;
            }

            @unlink($link);
        } elseif (file_exists($link)) {
            return;
        }

        try {
            File::link($target, $link);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
