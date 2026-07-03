<?php

namespace Database\Seeders;

use App\Models\DailySchedule;
use App\Support\DevAccountBootstrap;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('Production 環境禁止執行 DatabaseSeeder。');

            return;
        }

        $devAdminPassword = env('SEED_ADMIN_PASSWORD', 'admin1');
        DevAccountBootstrap::ensureAccounts();

        $employeeModels = \App\Models\User::query()
            ->where('role', 'employee')
            ->orderBy('id')
            ->get();

        if (DailySchedule::query()->exists()) {
            $this->command?->info('Seeder 完成。本地測試管理員：admin1 / '.$devAdminPassword);

            return;
        }

        $sampleSchedules = [
            [
                'customer_name' => '王小姐',
                'customer_address' => '台北市大安區復興南路一段100號',
                'customer_phone' => '0912345678',
                'ac_units' => 11,
                'cleaning_price' => 11000,
                'notes' => '需自備梯子',
            ],
            [
                'customer_name' => '陳先生',
                'customer_address' => '新北市板橋區文化路二段50號',
                'customer_phone' => '0922333444',
                'ac_units' => 14,
                'cleaning_price' => 14000,
                'notes' => null,
            ],
            [
                'customer_name' => '林太太',
                'customer_address' => '桃園市中壢區中央西路二段88號',
                'customer_phone' => '0933555666',
                'ac_units' => 11,
                'cleaning_price' => 11000,
                'notes' => '社區需登記',
            ],
            [
                'customer_name' => '張先生',
                'customer_address' => '台北市信義區松仁路7號',
                'customer_phone' => '0944777888',
                'ac_units' => 18,
                'cleaning_price' => 18000,
                'notes' => '停車場B2',
            ],
            [
                'customer_name' => '黃小姐',
                'customer_address' => '新北市三重區重新路三段20號',
                'customer_phone' => '0955999000',
                'ac_units' => 11,
                'cleaning_price' => 11000,
                'notes' => '下午較方便',
            ],
        ];

        $workDates = [
            now()->toDateString(),
            now()->addDay()->toDateString(),
            now()->addDays(2)->toDateString(),
            now()->addDays(3)->toDateString(),
        ];

        $timeSlots = [
            ['start_time' => '09:00', 'end_time' => '11:00'],
            ['start_time' => '11:30', 'end_time' => '13:30'],
            ['start_time' => '14:00', 'end_time' => '16:00'],
            ['start_time' => '16:30', 'end_time' => '18:30'],
            ['start_time' => '09:30', 'end_time' => '12:00'],
        ];

        foreach ($sampleSchedules as $index => $schedule) {
            $slot = $timeSlots[$index % count($timeSlots)];

            DailySchedule::query()->create([
                'user_id' => $employeeModels[$index % count($employeeModels)]->id,
                'work_date' => $workDates[$index % count($workDates)],
                'start_time' => $slot['start_time'],
                'end_time' => $slot['end_time'],
                'customer_name' => $schedule['customer_name'],
                'customer_address' => $schedule['customer_address'],
                'customer_phone' => $schedule['customer_phone'],
                'ac_units' => $schedule['ac_units'],
                'cleaning_price' => $schedule['cleaning_price'],
                'task_details' => $schedule['ac_units'].'台'.$schedule['cleaning_price'],
                'notes' => $schedule['notes'],
            ]);
        }

        $this->command?->info('Seeder 完成。本地測試管理員：admin1 / '.$devAdminPassword);
    }
}
