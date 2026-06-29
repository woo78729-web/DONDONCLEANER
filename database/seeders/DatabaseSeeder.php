<?php

namespace Database\Seeders;

use App\Models\DailySchedule;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $admins = [
            ['account' => 'admin1', 'name' => '管理員一'],
            ['account' => 'admin2', 'name' => '管理員二'],
        ];

        foreach ($admins as $admin) {
            User::query()->create([
                'account' => $admin['account'],
                'password' => Hash::make('password123'),
                'name' => $admin['name'],
                'role' => 'admin',
                'is_active' => true,
            ]);
        }

        $employees = [
            ['account' => 'emp1', 'name' => '員工一'],
            ['account' => 'emp2', 'name' => '員工二'],
        ];

        $employeeModels = [];

        foreach ($employees as $employee) {
            $employeeModels[] = User::query()->create([
                'account' => $employee['account'],
                'password' => Hash::make('password123'),
                'name' => $employee['name'],
                'role' => 'employee',
                'is_active' => true,
            ]);
        }

        $sampleSchedules = [
            [
                'customer_address' => '台北市大安區復興南路一段100號',
                'customer_phone' => '0912345678',
                'task_details' => '11離11000',
                'notes' => '需自備梯子',
            ],
            [
                'customer_address' => '新北市板橋區文化路二段50號',
                'customer_phone' => '0922333444',
                'task_details' => '14離14000',
                'notes' => null,
            ],
            [
                'customer_address' => '桃園市中壢區中央西路二段88號',
                'customer_phone' => '0933555666',
                'task_details' => '11離11000',
                'notes' => '社區需登記',
            ],
            [
                'customer_address' => '台北市信義區松仁路7號',
                'customer_phone' => '0944777888',
                'task_details' => '18離18000',
                'notes' => '停車場B2',
            ],
            [
                'customer_address' => '新北市三重區重新路三段20號',
                'customer_phone' => '0955999000',
                'task_details' => '11離11000',
                'notes' => '下午較方便',
            ],
        ];

        $workDates = [
            now()->toDateString(),
            now()->addDay()->toDateString(),
            now()->addDays(2)->toDateString(),
            now()->addDays(3)->toDateString(),
        ];

        foreach ($sampleSchedules as $index => $schedule) {
            DailySchedule::query()->create([
                'user_id' => $employeeModels[$index % count($employeeModels)]->id,
                'work_date' => $workDates[$index % count($workDates)],
                'customer_address' => $schedule['customer_address'],
                'customer_phone' => $schedule['customer_phone'],
                'task_details' => $schedule['task_details'],
                'notes' => $schedule['notes'],
            ]);
        }
    }
}
