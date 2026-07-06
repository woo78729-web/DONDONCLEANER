<?php

namespace App\Support;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class PublicStorageLink
{
    public static function ensure(): void
    {
        $link = public_path('storage');
        $target = storage_path('app/public');

        File::ensureDirectoryExists($target);
        File::ensureDirectoryExists($target.'/avatars');

        if (is_link($link)) {
            $resolved = realpath($link);
            $expected = realpath($target);

            if ($resolved !== false && $expected !== false && $resolved === $expected) {
                return;
            }

            @unlink($link);
        } elseif (file_exists($link) && ! is_link($link)) {
            if (is_dir($link)) {
                File::deleteDirectory($link);
            } else {
                File::delete($link);
            }
        }

        try {
            Artisan::call('storage:link', ['--force' => true]);
        } catch (\Throwable $exception) {
            try {
                File::link($target, $link);
            } catch (\Throwable $fallbackException) {
                report($fallbackException);
            }
        }
    }
}
