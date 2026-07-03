<?php

namespace App\Support;

use App\Models\DailyReport;
use Illuminate\Support\Collection;

class EmployeeMonthlySummary
{
    /**
     * @return array<string, mixed>
     */
    public static function build(int $userId, string $yearMonth): array
    {
        [$year, $month] = array_pad(explode('-', $yearMonth), 2, null);

        if (! $year || ! $month) {
            throw new \InvalidArgumentException('year_month must be YYYY-MM');
        }

        $reports = DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->select('id', 'user_id', 'work_date', 'ac_units', 'pricing_lines', 'unit_price', 'needs_invoice'),
                'companyRemittance',
            ])
            ->whereHas('dailySchedule', function ($query) use ($userId, $year, $month) {
                $query
                    ->where('user_id', $userId)
                    ->whereYear('work_date', (int) $year)
                    ->whereMonth('work_date', (int) $month);
            })
            ->get();

        return self::summarizeReports($reports, $userId, $yearMonth);
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     * @return array<string, mixed>
     */
    public static function summarizeReports(Collection $reports, int $userId, string $yearMonth): array
    {
        $totalJobAmount = 0;
        $employeeCashReceived = 0;
        $totalCollected = 0;
        $totalRemittance = 0;
        $totalAdvance = 0;
        $totalCompanyTransfer = 0;
        $companyInboundExpected = 0;
        $totalCompletedUnits = 0;

        foreach ($reports as $report) {
            $schedule = $report->dailySchedule;

            if (! $schedule) {
                continue;
            }

            $financial = CompanyRemittanceSupport::financialBreakdown($report);
            $lines = SchedulePricing::normalizeLines(
                $schedule->pricing_lines,
                $schedule->ac_units,
                $schedule->unit_price
            );

            $needsInvoice = (bool) $report->has_tax
                || (bool) $report->needs_invoice_and_mail
                || (bool) $schedule->needs_invoice;

            $summary = EmployeeRemittance::summarizeReport(
                $lines,
                (int) $report->completed_units,
                (int) $report->planned_units,
                (bool) $report->paid_to_company,
                $needsInvoice,
            );

            $totalJobAmount += (int) $financial['total_amount'];
            $employeeCashReceived += (int) $financial['employee_received'];
            $totalCollected += (int) $report->collected_amount;
            $totalRemittance += $summary['collect_from_employee'];
            $totalAdvance += $summary['advance_to_employee'];
            $companyInboundExpected += $report->paid_to_company ? (int) $summary['company_transfer'] : 0;

            if (! $report->paid_to_company || CompanyRemittanceSupport::countsTowardHongyiAccount($report)) {
                $totalCompanyTransfer += $summary['company_transfer'];
            }

            $totalCompletedUnits += (int) $report->completed_units;
        }

        $netSettlement = $totalRemittance - $totalAdvance;
        $paymentToFinance = max(0, $netSettlement);
        $payoutFromFinance = max(0, -$netSettlement);
        $ownAmount = $totalCollected - $totalRemittance + $totalAdvance;
        $compensationDueToAtai = MaintenanceRecordSupport::employeeCompensationDue($userId, $yearMonth);

        return [
            'year_month' => $yearMonth,
            'report_count' => $reports->count(),
            'completed_units' => $totalCompletedUnits,
            'total_job_amount' => $totalJobAmount,
            'employee_cash_received' => $employeeCashReceived,
            'total_collected' => $totalCollected,
            'remittance_due' => $totalRemittance,
            'company_transfer' => $totalCompanyTransfer,
            'company_inbound_expected' => $companyInboundExpected,
            'advance_from_company_jobs' => $totalAdvance,
            'payment_to_finance' => $paymentToFinance,
            'payout_from_finance' => $payoutFromFinance,
            'own_amount' => $ownAmount,
            'compensation_due_to_company' => $compensationDueToAtai,
            'compensation_due_to_atai' => $compensationDueToAtai,
        ];
    }
}
