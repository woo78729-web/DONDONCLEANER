<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$user = App\Models\User::query()->where('account', 'admin1')->first();

echo 'users='.App\Models\User::count().PHP_EOL;

if (! $user) {
    echo "admin1: NOT_FOUND\n";
    exit(1);
}

echo 'role='.$user->role.PHP_EOL;
echo 'active='.(int) $user->is_active.PHP_EOL;
echo 'password_admin1='.(Illuminate\Support\Facades\Hash::check('admin1', $user->password) ? 'OK' : 'FAIL').PHP_EOL;
