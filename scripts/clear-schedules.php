<?php

use App\Models\DailyReport;
use App\Models\DailySchedule;

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$scheduleCount = DailySchedule::query()->count();
$reportCount = DailyReport::query()->count();

echo "刪除前：派班 {$scheduleCount} 筆、回報 {$reportCount} 筆\n";

DailySchedule::query()->delete();

echo '刪除後：派班 '.DailySchedule::query()->count().' 筆、回報 '.DailyReport::query()->count()." 筆\n";
echo "已完成清空行事曆派班資料。\n";
