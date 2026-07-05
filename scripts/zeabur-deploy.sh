#!/usr/bin/env sh
set -eu

echo "==> Running migrations..."
php artisan migrate --force

echo "==> Linking public/storage..."
php artisan storage:link --force

echo "==> Deploy prep complete."
