<?php



namespace App\Http\Controllers\Employee;



use App\Http\Controllers\Controller;

use App\Models\DailySchedule;

use App\Support\EmployeeScheduleSupport;

use Illuminate\Http\JsonResponse;

use Illuminate\Http\Request;

use Illuminate\Validation\Rule;



class ScheduleController extends Controller

{

    public function index(Request $request): JsonResponse

    {

        $validated = $request->validate([

            'date_from' => ['nullable', 'date'],

            'date_to' => [

                'nullable',

                'date',

                Rule::when($request->filled('date_from'), 'after_or_equal:date_from'),

            ],

            'view' => ['nullable', 'in:range,today,tomorrow'],

        ]);



        $today = now()->toDateString();

        $tomorrow = now()->addDay()->toDateString();



        if (($validated['view'] ?? 'range') === 'today') {

            $todaySchedules = $this->scheduleQuery($request->user()->id, $today, $today);
            $overduePast = EmployeeScheduleSupport::overduePastUnreportedSchedules($request->user()->id);

            $schedules = EmployeeScheduleSupport::annotateOverdueUnreported(
                EmployeeScheduleSupport::pinOverdueUnreported(
                    $overduePast->concat($todaySchedules)->unique('id'),
                ),
            );

            return $this->success([

                'work_date' => $today,

                'schedules' => $schedules,

                'overdue_unreported_count' => EmployeeScheduleSupport::countOverdueUnreported($schedules),

            ], '今日班表查詢成功');

        }



        if (($validated['view'] ?? 'range') === 'tomorrow') {

            $schedules = $this->scheduleQuery($request->user()->id, $tomorrow, $tomorrow);



            return $this->success([

                'work_date' => $tomorrow,

                'schedules' => $schedules,

            ], '明日班表查詢成功');

        }



        $dateFrom = $validated['date_from'] ?? now()->startOfMonth()->toDateString();

        $dateTo = $validated['date_to'] ?? now()->endOfMonth()->toDateString();



        if ($dateTo > $tomorrow) {

            $dateTo = $tomorrow;

        }



        if ($dateFrom > $dateTo) {

            $dateFrom = $dateTo;

        }



        return $this->success([

            'date_range' => [

                'from' => $dateFrom,

                'to' => $dateTo,

            ],

            'schedules' => $this->scheduleQuery($request->user()->id, $dateFrom, $dateTo),

        ], '班表查詢成功');

    }



    /**

     * @return \Illuminate\Database\Eloquent\Collection<int, DailySchedule>

     */

    private function scheduleQuery(int $userId, string $dateFrom, string $dateTo)

    {

        return DailySchedule::query()
            ->with(EmployeeScheduleSupport::scheduleRelations())

            ->where('user_id', $userId)

            ->whereDate('work_date', '>=', $dateFrom)

            ->whereDate('work_date', '<=', $dateTo)

            ->orderBy('work_date')

            ->orderBy('start_time')

            ->orderBy('id')

            ->get();

    }

}


