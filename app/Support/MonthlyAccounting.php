<?php

namespace App\Support;

use App\Models\AccountingSetting;
use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Models\DailySchedule;
use App\Models\ManualPostageEntry;
use App\Models\MonthlyAdvanceEntry;
use App\Models\User;
use Illuminate\Support\Collection;

class MonthlyAccounting
{
    public const PARTNER_ATAI = 'atai';

    public const PARTNER_HONGYI = 'hongyi';

    public const POSTAGE_UNIT = 28;

    public const AUTO_INVOICE_TAX_LABEL = '發票稅金 8%';

    public const AUTO_TRAVEL_ALLOWANCE_LABEL = '車馬費加給';

    public const AUTO_POSTAGE_LABEL = '郵資';

    /**
     * @return list<array{key:string, label:string, amount:int}>
     */
    public static function defaultFixedExpenses(): array
    {
        return [
            ['key' => 'expense_control', 'label' => '管控開支', 'amount' => 8000],
            ['key' => 'expense_phone', 'label' => '電話費', 'amount' => 400],
            ['key' => 'expense_ai', 'label' => 'AI 開支', 'amount' => 700],
            ['key' => 'expense_ad', 'label' => '廣告', 'amount' => 10500],
        ];
    }

    public static function ensureDefaultSettings(): void
    {
        foreach (self::defaultFixedExpenses() as $expense) {
            AccountingSetting::query()->firstOrCreate(
                ['key' => $expense['key']],
                [
                    'label' => $expense['label'],
                    'amount' => $expense['amount'],
                ]
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function buildSummary(string $yearMonth): array
    {
        self::ensureDefaultSettings();

        [$year, $month] = array_pad(explode('-', $yearMonth), 2, null);

        if (! $year || ! $month) {
            throw new \InvalidArgumentException('year_month must be YYYY-MM');
        }

        CompanyRemittanceSupport::syncForMonth((int) $year, (int) $month);

        $dateFrom = sprintf('%04d-%02d-01', (int) $year, (int) $month);
        $dateTo = date('Y-m-t', strtotime($dateFrom));

        $reports = self::reportsForMonth((int) $year, (int) $month);

        $employeeSummaries = self::summarizeEmployees($reports, $yearMonth);
        $fixedExpenseDraft = MonthlyFixedExpenseSupport::draftPayload($yearMonth);
        $fixedExpenses = MonthlyFixedExpenseSupport::amountsForSettlement($yearMonth);
        $fixedExpensesSaved = MonthlyFixedExpenseSupport::findForMonth($yearMonth) !== null;
        $mailRecipientCount = MailPostageAccounting::countSentRecipientsForMonth((int) $year, (int) $month);
        $manualPostageEntries = MailPostageAccounting::manualPostageForMonthQuery((int) $year, (int) $month)
            ->orderByDesc('id')
            ->get()
            ->map(fn (ManualPostageEntry $entry) => self::manualPostagePayload($entry))
            ->values();
        $manualPostageAmount = (int) $manualPostageEntries->sum('amount');
        $manualPostageCount = $manualPostageEntries->count();
        $schedulePostageAmount = $mailRecipientCount * self::POSTAGE_UNIT;
        $autoPostage = $schedulePostageAmount + $manualPostageAmount;
        $autoInvoiceTax = (int) $reports->sum('report_invoice_tax_cost');
        $travelAllowanceTotal = (int) $reports->sum('travel_allowance');
        $compensationDueToCompany = (int) array_sum(array_column($employeeSummaries, 'compensation_due_to_company'));

        $manualAdvanceEntries = MonthlyAdvanceEntry::query()
            ->where('year_month', $yearMonth)
            ->orderBy('partner')
            ->orderBy('id')
            ->get()
            ->map(fn (MonthlyAdvanceEntry $entry) => self::manualAdvancePayload($entry))
            ->values();

        $autoAdvanceEntries = array_merge(
            self::fixedExpenseAdvanceEntries($fixedExpenses),
            self::autoAdvanceEntries($autoInvoiceTax, $travelAllowanceTotal),
        );
        $autoCharges = self::autoCharges($mailRecipientCount, $manualPostageCount, $autoPostage);

        $totals = self::calculateTotals(
            $employeeSummaries,
            $fixedExpenses,
            $manualAdvanceEntries,
            $autoPostage,
            $autoInvoiceTax,
            $compensationDueToCompany,
            $travelAllowanceTotal,
        );

        $remittanceTotals = self::remittanceTotalsForMonth((int) $year, (int) $month);
        $companyTransfers = self::companyTransfersForMonth((int) $year, (int) $month);
        $totals['company_transfer_count'] = count($companyTransfers);
        $totals['company_inbound_expected'] = $remittanceTotals['expected'];
        $totals['company_transfer'] = $remittanceTotals['confirmed'];
        $totals['hongyi_payment'] = $totals['profit_share_half']
            - $remittanceTotals['expected']
            + $totals['invoice_tax_cost'];
        $totals['payment_to_finance_total'] = (int) array_sum(array_column($employeeSummaries, 'payment_to_finance'));
        $totals['payout_from_finance_total'] = (int) array_sum(array_column($employeeSummaries, 'payout_from_finance'));
        $totals['compensation_due_to_company_total'] = $compensationDueToCompany;
        $totals['compensation_due_to_atai_total'] = $compensationDueToCompany;
        $totals['travel_allowance_total'] = $travelAllowanceTotal;
        $totals['performance_totals'] = self::performanceTotalsFromEmployees($employeeSummaries);
        $totals['atai_take_home'] = $totals['atai_net_balance'];
        $totals['atai_income'] = $totals['atai_retained'];
        $totals['hongyi_income'] = $totals['profit_share_half'];
        $totals['hongyi_take_home'] = $totals['profit_share_half'];

        return [
            'year_month' => $yearMonth,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'employees' => $employeeSummaries,
            'company_transfers' => $companyTransfers,
            'fixed_expenses' => $fixedExpenses,
            'fixed_expense_drafts' => $fixedExpenseDraft['items'],
            'fixed_expenses_saved' => $fixedExpensesSaved,
            'fixed_expenses_source' => $fixedExpenseDraft['source'],
            'auto_charges' => $autoCharges,
            'manual_postage_entries' => $manualPostageEntries,
            'auto_advance_entries' => $autoAdvanceEntries,
            'advance_entries' => $manualAdvanceEntries,
            'totals' => $totals,
            'partner_settlement' => self::partnerSettlement($totals),
            'remittance_rates' => EmployeeRemittance::remittanceMap(),
        ];
    }

    /**
     * @return Collection<int, DailyReport>
     */
    private static function reportsForMonth(int $year, int $month): Collection
    {
        return DailyReport::query()
            ->with([
                'dailySchedule' => fn ($query) => $query->with([
                    'user:id,name,account,avatar_path',
                    'cleaningProject',
                ]),
                'companyRemittance',
            ])
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)->whereMonth('work_date', $month);
            })
            ->get();
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     */
    private static function countMailRecipientsForMonth(int $year, int $month): int
    {
        return MailPostageAccounting::countSentRecipientsForMonth($year, $month);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function autoCharges(int $scheduleMailCount, int $manualPostageCount, int $autoPostage): array
    {
        if ($autoPostage <= 0) {
            return [];
        }

        $descriptionParts = [];

        if ($scheduleMailCount > 0) {
            $descriptionParts[] = "{$scheduleMailCount} 筆派工寄信";
        }

        if ($manualPostageCount > 0) {
            $descriptionParts[] = "{$manualPostageCount} 筆補寄郵資";
        }

        return [[
            'key' => 'postage',
            'label' => self::AUTO_POSTAGE_LABEL,
            'amount' => $autoPostage,
            'mail_report_count' => $scheduleMailCount + $manualPostageCount,
            'schedule_mail_count' => $scheduleMailCount,
            'manual_postage_count' => $manualPostageCount,
            'unit_amount' => self::POSTAGE_UNIT,
            'description' => implode('＋', $descriptionParts),
            'auto' => true,
        ]];
    }

    /**
     * @param  list<array{key:string, label:string, amount:int}>  $fixedExpenses
     * @return list<array<string, mixed>>
     */
    private static function fixedExpenseAdvanceEntries(array $fixedExpenses): array
    {
        return array_map(fn (array $expense) => [
            'partner' => self::PARTNER_ATAI,
            'partner_label' => self::partnerLabel(self::PARTNER_ATAI),
            'label' => $expense['label'],
            'amount' => $expense['amount'],
            'notes' => '固定每月開支',
            'auto' => true,
            'fixed_expense' => true,
            'fixed_expense_key' => $expense['key'],
        ], $fixedExpenses);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function autoAdvanceEntries(int $autoInvoiceTax, int $travelAllowanceTotal = 0): array
    {
        $entries = [];

        if ($autoInvoiceTax > 0) {
            $entries[] = [
                'partner' => self::PARTNER_HONGYI,
                'partner_label' => self::partnerLabel(self::PARTNER_HONGYI),
                'label' => self::AUTO_INVOICE_TAX_LABEL,
                'amount' => $autoInvoiceTax,
                'notes' => '宏逸代墊發票稅，月底與阿泰軋差',
                'auto' => true,
            ];
        }

        if ($travelAllowanceTotal > 0) {
            $entries[] = [
                'partner' => self::PARTNER_ATAI,
                'partner_label' => self::partnerLabel(self::PARTNER_ATAI),
                'label' => self::AUTO_TRAVEL_ALLOWANCE_LABEL,
                'amount' => $travelAllowanceTotal,
                'notes' => '當月師傅車馬費加給自動帶入',
                'auto' => true,
            ];
        }

        return $entries;
    }

    /**
     * @param  Collection<int, DailyReport>  $reports
     * @return list<array<string, mixed>>
     */
    private static function summarizeEmployees(Collection $reports, string $yearMonth): array
    {
        /** @var array<int, array<string, mixed>> $byEmployee */
        $byEmployee = [];

        foreach ($reports as $report) {
            $schedule = $report->dailySchedule;

            if (! $schedule || ! $schedule->user) {
                continue;
            }

            $employeeId = (int) $schedule->user_id;
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
                (int) $schedule->ac_units,
                (bool) $report->paid_to_company,
                $needsInvoice,
            );
            $scaledLines = EmployeeRemittance::scaleLines(
                $lines,
                (int) $report->completed_units,
                (int) $schedule->ac_units,
            );
            $tierUnits = EmployeeRemittance::tierUnitCounts($scaledLines);
            $travelAllowance = (int) $report->travel_allowance;

            $financial = CompanyRemittanceSupport::financialBreakdown($report);
            $isProjectRemittance = $schedule->cleaning_project_id
                && $schedule->cleaningProject
                && (bool) $schedule->cleaningProject->expects_company_remittance;
            $companyInboundExpected = ($report->paid_to_company && ! $isProjectRemittance)
                ? (int) $summary['company_transfer']
                : 0;
            $companyTransferConfirmed = ($companyInboundExpected > 0 && CompanyRemittanceSupport::countsTowardHongyiAccount($report))
                ? $companyInboundExpected
                : 0;

            if (! isset($byEmployee[$employeeId])) {
                $byEmployee[$employeeId] = [
                    'user_id' => $employeeId,
                    'name' => $schedule->user->name,
                    'account' => $schedule->user->account,
                    'completed_units' => 0,
                    'total_job_amount' => 0,
                    'employee_cash_received' => 0,
                    'collect_from_employee' => 0,
                    'advance_to_employee' => 0,
                    'company_inbound_expected' => 0,
                    'company_transfer' => 0,
                    'invoice_surcharge_due' => 0,
                    'company_share_due' => 0,
                    'remittance_company_share' => 0,
                    'invoice_tax_cost' => 0,
                    'net_collect_from_employee' => 0,
                    'payment_to_finance' => 0,
                    'payout_from_finance' => 0,
                    'compensation_due_to_company' => 0,
                    'compensation_due_to_atai' => 0,
                    'travel_allowance' => 0,
                    'units_by_price' => EmployeeRemittance::emptyTierUnitCounts(),
                    'company_commission' => 0,
                    'employee_actual_pay' => 0,
                    'collect_due_from_employee' => 0,
                    'reports' => [],
                ];
            }

            $byEmployee[$employeeId]['completed_units'] += $summary['completed_units'];
            $byEmployee[$employeeId]['total_job_amount'] += (int) $financial['total_amount'];
            $byEmployee[$employeeId]['employee_cash_received'] += (int) $financial['employee_received'];
            $byEmployee[$employeeId]['collect_from_employee'] += $summary['collect_from_employee'];
            $byEmployee[$employeeId]['advance_to_employee'] += $summary['advance_to_employee'];
            $byEmployee[$employeeId]['company_inbound_expected'] += $companyInboundExpected;
            $byEmployee[$employeeId]['company_transfer'] += $companyTransferConfirmed;
            $byEmployee[$employeeId]['invoice_surcharge_due'] += (int) $summary['invoice_surcharge_due'];
            $byEmployee[$employeeId]['company_share_due'] += (int) $summary['company_share_due'];
            $byEmployee[$employeeId]['remittance_company_share'] += (int) $summary['remittance_company_share'];
            $byEmployee[$employeeId]['invoice_tax_cost'] += (int) $report->report_invoice_tax_cost;
            $byEmployee[$employeeId]['travel_allowance'] += $travelAllowance;
            $byEmployee[$employeeId]['units_by_price'] = EmployeeRemittance::mergeTierUnitCounts(
                $byEmployee[$employeeId]['units_by_price'],
                $tierUnits,
            );
            $byEmployee[$employeeId]['reports'][] = [
                'report_id' => $report->id,
                'work_date' => $schedule->work_date?->format('Y-m-d') ?? (string) $schedule->work_date,
                'customer_name' => $schedule->customer_name,
                'task_details' => $schedule->task_details,
                'needs_mail' => (bool) $schedule->needs_mail,
                'needs_invoice' => $needsInvoice,
                'paid_to_company' => (bool) $report->paid_to_company,
                'completed_units' => $summary['completed_units'],
                'total_job_amount' => (int) $financial['total_amount'],
                'employee_cash_received' => (int) $financial['employee_received'],
                'collect_from_employee' => $summary['collect_from_employee'],
                'advance_to_employee' => $summary['advance_to_employee'],
                'company_inbound_expected' => $companyInboundExpected,
                'company_transfer' => $companyTransferConfirmed,
                'invoice_surcharge_due' => (int) $summary['invoice_surcharge_due'],
                'company_share_due' => (int) $summary['company_share_due'],
                'remittance_company_share' => (int) $summary['remittance_company_share'],
                'remittance_status' => $report->companyRemittance?->status,
                'remittance_status_label' => $report->companyRemittance
                    ? CompanyRemittanceSupport::statusLabel($report->companyRemittance->status)
                    : null,
                'report_invoice_tax_cost' => (int) $report->report_invoice_tax_cost,
                'temporary_postage' => (int) $report->temporary_postage,
                'travel_allowance' => $travelAllowance,
                'units_by_price' => $tierUnits,
            ];
        }

        foreach ($byEmployee as &$employee) {
            $employee['net_collect_from_employee'] = $employee['collect_from_employee'] - $employee['advance_to_employee'];
            $employee['payment_to_finance'] = max(0, $employee['net_collect_from_employee']);
            $employee['payout_from_finance'] = max(0, -$employee['net_collect_from_employee']);
        }
        unset($employee);

        $compensationByEmployee = MaintenanceRecordSupport::employeeCompensationDueByMonth($yearMonth);

        foreach ($compensationByEmployee as $employeeId => $amount) {
            if (! isset($byEmployee[$employeeId])) {
                $user = User::query()->find($employeeId);

                if (! $user) {
                    continue;
                }

                $byEmployee[$employeeId] = [
                    'user_id' => $employeeId,
                    'name' => $user->name,
                    'account' => $user->account,
                    'completed_units' => 0,
                    'total_job_amount' => 0,
                    'employee_cash_received' => 0,
                    'collect_from_employee' => 0,
                    'advance_to_employee' => 0,
                    'company_inbound_expected' => 0,
                    'company_transfer' => 0,
                    'invoice_surcharge_due' => 0,
                    'company_share_due' => 0,
                    'remittance_company_share' => 0,
                    'invoice_tax_cost' => 0,
                    'net_collect_from_employee' => 0,
                    'payment_to_finance' => 0,
                    'payout_from_finance' => 0,
                    'compensation_due_to_company' => 0,
                    'compensation_due_to_atai' => 0,
                    'travel_allowance' => 0,
                    'units_by_price' => EmployeeRemittance::emptyTierUnitCounts(),
                    'company_commission' => 0,
                    'employee_actual_pay' => 0,
                    'collect_due_from_employee' => 0,
                    'reports' => [],
                ];
            }

            $byEmployee[$employeeId]['compensation_due_to_company'] = $amount;
            $byEmployee[$employeeId]['compensation_due_to_atai'] = $amount;
        }

        foreach ($byEmployee as &$employee) {
            $employee['compensation_due_to_company'] = (int) ($employee['compensation_due_to_company'] ?? 0);
            $employee['compensation_due_to_atai'] = $employee['compensation_due_to_company'];
            $employee['company_commission'] = max(
                0,
                $employee['total_job_amount']
                    - $employee['advance_to_employee']
                    - max(0, $employee['employee_cash_received'] - $employee['collect_from_employee']),
            );
            $employee['employee_actual_pay'] = max(
                0,
                $employee['total_job_amount']
                    - $employee['company_commission']
                    - $employee['invoice_tax_cost']
                    - $employee['compensation_due_to_company']
                    + ($employee['travel_allowance'] ?? 0),
            );
            $employee['collect_due_from_employee'] = ($employee['payment_to_finance'] ?? 0) + $employee['compensation_due_to_company'];
        }
        unset($employee);

        uasort($byEmployee, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return array_values($byEmployee);
    }

    /**
     * @return array{expected:int, confirmed:int}
     */
    private static function remittanceTotalsForMonth(int $year, int $month): array
    {
        $remittances = CompanyRemittanceSupport::monthQuery($year, $month)->get();

        return [
            'expected' => (int) $remittances->sum('amount'),
            'confirmed' => (int) $remittances
                ->where('status', CompanyRemittance::STATUS_CONFIRMED)
                ->sum('amount'),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function companyTransfersForMonth(int $year, int $month): array
    {
        return CompanyRemittanceSupport::monthQuery($year, $month)
            ->with([
                'report.dailySchedule.user:id,name',
                'report.dailySchedule.cleaningProject.schedules.user:id,name',
                'cleaningProject.schedules.dailyReport',
                'cleaningProject.schedules.user:id,name',
            ])
            ->orderBy('expected_remittance_date')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->map(fn (CompanyRemittance $remittance) => self::companyTransferPayload($remittance))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private static function companyTransferPayload(CompanyRemittance $remittance): array
    {
        $remittance->loadMissing([
            'report.dailySchedule.user:id,name',
            'report.dailySchedule.cleaningProject',
            'cleaningProject.schedules.dailyReport',
            'cleaningProject.schedules.user:id,name',
        ]);

        $report = $remittance->report;
        $schedule = $report?->dailySchedule;
        $project = $remittance->cleaningProject ?? $schedule?->cleaningProject;
        $isProjectTotal = $project !== null && (bool) $project->expects_company_remittance;
        $amount = (int) $remittance->amount;
        $confirmedAmount = $remittance->status === CompanyRemittance::STATUS_CONFIRMED ? $amount : 0;
        $advanceToEmployee = 0;
        $completedUnits = 0;
        $needsInvoice = (bool) ($project?->needs_invoice ?? $schedule?->needs_invoice);
        $taskDetails = $schedule?->task_details;

        if ($isProjectTotal && $project) {
            $taskDetails = $project->task_details ?? $taskDetails;

            foreach ($project->schedules as $projectSchedule) {
                $projectReport = $projectSchedule->dailyReport;

                if (! $projectReport || ! $projectReport->paid_to_company) {
                    continue;
                }

                $breakdown = CompanyRemittanceSupport::financialBreakdown($projectReport);
                $advanceToEmployee += (int) $breakdown['advance_to_employee'];
                $completedUnits += (int) $projectReport->completed_units;
            }
        } elseif ($report) {
            $breakdown = CompanyRemittanceSupport::financialBreakdown($report);
            $advanceToEmployee = (int) $breakdown['advance_to_employee'];
            $completedUnits = (int) $report->completed_units;
            $needsInvoice = (bool) $report->has_tax
                || (bool) $report->needs_invoice_and_mail
                || (bool) $schedule?->needs_invoice;
        }

        $employeeName = $schedule?->user?->name;

        if ($isProjectTotal && $project) {
            $employeeName = $project->schedules
                ->pluck('user.name')
                ->filter()
                ->unique()
                ->values()
                ->join('、') ?: $employeeName;
        }

        $workDate = $isProjectTotal
            ? ($project?->planned_end_date?->format('Y-m-d') ?? (string) $project?->planned_end_date)
            : ($schedule?->work_date?->format('Y-m-d') ?? (string) $schedule?->work_date);

        if ($remittance->expected_remittance_date !== null) {
            $workDate = $remittance->expected_remittance_date->format('Y-m-d');
        }

        return [
            'remittance_id' => $remittance->id,
            'report_id' => $remittance->report_id,
            'cleaning_project_id' => $project?->id,
            'work_date' => $workDate,
            'employee_name' => $employeeName,
            'customer_name' => $project?->customer_name ?? $schedule?->customer_name,
            'task_details' => $taskDetails,
            'completed_units' => $completedUnits,
            'needs_invoice' => $needsInvoice,
            'amount' => $amount,
            'confirmed_amount' => $confirmedAmount,
            'advance_to_employee' => $advanceToEmployee,
            'remittance_status' => $remittance->status,
            'remittance_status_label' => CompanyRemittanceSupport::statusLabel($remittance->status),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function manualAdvancePayload(MonthlyAdvanceEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'year_month' => $entry->year_month,
            'partner' => $entry->partner,
            'partner_label' => self::partnerLabel($entry->partner),
            'label' => $entry->label,
            'amount' => $entry->amount,
            'notes' => $entry->notes,
            'auto' => false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function manualPostagePayload(ManualPostageEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'year_month' => $entry->year_month,
            'mailed_at' => $entry->mailed_at?->format('Y-m-d'),
            'amount' => (int) $entry->amount,
            'mail_recipient' => $entry->mail_recipient,
            'mail_phone' => $entry->mail_phone,
            'mail_address' => $entry->mail_address,
            'notes' => $entry->notes,
            'created_at' => $entry->created_at?->toDateTimeString(),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $employees
     * @param  list<array{key:string, label:string, amount:int}>  $fixedExpenses
     * @param  Collection<int, array<string, mixed>>|list<array<string, mixed>>  $manualAdvanceEntries
     * @return array<string, int>
     */
    private static function calculateTotals(
        array $employees,
        array $fixedExpenses,
        Collection|array $manualAdvanceEntries,
        int $autoPostage = 0,
        int $autoInvoiceTax = 0,
        int $compensationDueToCompany = 0,
        int $travelAllowanceTotal = 0,
    ): array {
        $entries = $manualAdvanceEntries instanceof Collection
            ? $manualAdvanceEntries
            : collect($manualAdvanceEntries);

        $collectFromEmployees = array_sum(array_column($employees, 'collect_from_employee'));
        $advanceToEmployees = array_sum(array_column($employees, 'advance_to_employee'));
        $jobNetFromEmployees = $collectFromEmployees - $advanceToEmployees;
        $netFromEmployees = $jobNetFromEmployees + $compensationDueToCompany;
        $companyTransferConfirmed = array_sum(array_column($employees, 'company_transfer'));
        $companyInboundExpected = array_sum(array_column($employees, 'company_inbound_expected'));
        $companyShareTotal = (int) array_sum(array_column($employees, 'company_share_due'));
        $invoiceSurchargeTotal = (int) array_sum(array_column($employees, 'invoice_surcharge_due'));
        $remittanceCompanyShare = (int) array_sum(array_column($employees, 'remittance_company_share'));
        $invoiceTaxCost = $autoInvoiceTax;
        $fixedExpenseTotal = array_sum(array_column($fixedExpenses, 'amount'));
        $manualAtaiAdvances = (int) $entries->where('partner', self::PARTNER_ATAI)->sum('amount');
        $manualHongyiAdvances = (int) $entries->where('partner', self::PARTNER_HONGYI)->sum('amount');
        $ataiAdvances = $manualAtaiAdvances + $fixedExpenseTotal + $travelAllowanceTotal;
        $hongyiAdvances = $manualHongyiAdvances + $autoInvoiceTax;
        $advanceEntryTotal = $manualAtaiAdvances + $manualHongyiAdvances + $autoInvoiceTax + $travelAllowanceTotal;
        $monthlyExpenseTotal = $fixedExpenseTotal + $autoPostage + $advanceEntryTotal;
        $operatingIncome = $companyShareTotal + $invoiceSurchargeTotal + $compensationDueToCompany;
        $grossProfit = $operatingIncome - $monthlyExpenseTotal;
        $profitShareHalf = (int) round($grossProfit / 2);
        $ataiShare = $profitShareHalf;
        $hongyiShare = $profitShareHalf - $companyInboundExpected + $invoiceTaxCost;
        $ataiNetBalance = $ataiShare - $ataiAdvances;

        return [
            'collect_from_employees' => $collectFromEmployees,
            'advance_to_employees' => $advanceToEmployees,
            'net_from_employees_jobs' => $jobNetFromEmployees,
            'compensation_due_to_company_total' => $compensationDueToCompany,
            'net_from_employees' => $netFromEmployees,
            'company_transfer' => $companyTransferConfirmed,
            'company_inbound_expected' => $companyInboundExpected,
            'company_share_total' => $companyShareTotal,
            'customer_invoice_surcharge_total' => $invoiceSurchargeTotal,
            'remittance_company_share_total' => $remittanceCompanyShare,
            'operating_income' => $operatingIncome,
            'profit_share_half' => $profitShareHalf,
            'invoice_tax_cost' => $invoiceTaxCost,
            'auto_postage' => $autoPostage,
            'auto_invoice_tax_advance' => $autoInvoiceTax,
            'travel_allowance_total' => $travelAllowanceTotal,
            'auto_travel_allowance_advance' => $travelAllowanceTotal,
            'fixed_expense_total' => $fixedExpenseTotal,
            'manual_atai_advance_total' => $manualAtaiAdvances,
            'manual_hongyi_advance_total' => $manualHongyiAdvances,
            'atai_advance_fixed_total' => $fixedExpenseTotal,
            'atai_advance_total' => $ataiAdvances,
            'hongyi_advance_total' => $hongyiAdvances,
            'advance_entry_total' => $advanceEntryTotal,
            'monthly_expense_total' => $monthlyExpenseTotal,
            'gross_profit' => $grossProfit,
            'hongyi_payment' => $hongyiShare,
            'atai_retained' => $ataiShare,
            'atai_net_balance' => $ataiNetBalance,
        ];
    }

    /**
     * @param  array<string, int>  $totals
     * @return array<string, mixed>
     */
    public static function partnerSettlement(array $totals): array
    {
        $profitShareHalf = (int) ($totals['profit_share_half'] ?? round($totals['gross_profit'] / 2));
        $companyTransferConfirmed = (int) ($totals['company_transfer'] ?? 0);
        $companyInboundExpected = (int) ($totals['company_inbound_expected'] ?? $companyTransferConfirmed);
        $invoiceTaxCost = (int) ($totals['invoice_tax_cost'] ?? 0);
        $interPartnerSettlement = (int) $totals['hongyi_payment'];
        $compensationDue = (int) ($totals['compensation_due_to_company_total'] ?? $totals['compensation_due_to_atai_total'] ?? 0);
        $jobNetFromEmployees = (int) ($totals['net_from_employees_jobs'] ?? ($totals['net_from_employees'] - $compensationDue));

        return [
            'basis' => [
                'net_from_employees_jobs' => $jobNetFromEmployees,
                'compensation_due_to_company' => $compensationDue,
                'net_from_employees' => (int) $totals['net_from_employees'],
                'company_share_total' => (int) ($totals['company_share_total'] ?? 0),
                'customer_invoice_surcharge_total' => (int) ($totals['customer_invoice_surcharge_total'] ?? 0),
                'remittance_company_share_total' => (int) ($totals['remittance_company_share_total'] ?? 0),
                'operating_income' => (int) ($totals['operating_income'] ?? 0),
                'monthly_expense_total' => (int) $totals['monthly_expense_total'],
                'gross_profit' => (int) $totals['gross_profit'],
                'profit_share_half' => $profitShareHalf,
                'travel_allowance_total' => (int) ($totals['travel_allowance_total'] ?? 0),
            ],
            'inter_partner' => [
                'profit_share_half' => $profitShareHalf,
                'customer_remittance_in_account' => $companyInboundExpected,
                'invoice_tax_hongyi_advance' => $invoiceTaxCost,
                'settlement_amount' => abs($interPartnerSettlement),
                'direction' => $interPartnerSettlement >= 0 ? 'dongdong_to_hongyi' : 'hongyi_to_dongdong',
                'direction_label' => $interPartnerSettlement >= 0
                    ? '東東應補給宏逸'
                    : '宏逸應退東東',
                'formula_hint' => '每人分潤 − 發票帳客戶匯款 + 宏逸代墊發票稅8%；正數表示東東補差額，負數表示宏逸退還東東',
            ],
            'atai' => [
                'account_label' => '東東公司帳（阿泰代管）',
                'profit_share_half' => $profitShareHalf,
                'profit_share_settled' => $profitShareHalf,
                'advances' => (int) $totals['atai_advance_total'],
                'compensation_from_employees' => $compensationDue,
                'employee_payment_due' => (int) ($totals['payment_to_finance_total'] ?? 0),
                'employee_payout_due' => (int) ($totals['payout_from_finance_total'] ?? 0),
                'inter_partner_settlement' => $interPartnerSettlement < 0 ? abs($interPartnerSettlement) : 0,
                'inter_partner_settlement_label' => $interPartnerSettlement < 0 ? '宏逸發票帳應退東東' : null,
                'income' => $profitShareHalf,
                'take_home' => (int) ($totals['atai_take_home'] ?? 0),
            ],
            'hongyi' => [
                'account_label' => '宏逸發票帳（宏逸代管）',
                'profit_share' => $profitShareHalf,
                'customer_remittance_in_account' => $companyInboundExpected,
                'customer_remittance_confirmed' => $companyTransferConfirmed,
                'invoice_tax_hongyi_advance' => $invoiceTaxCost,
                'inter_partner_settlement' => $interPartnerSettlement,
                'inter_partner_settlement_label' => $interPartnerSettlement >= 0 ? '東東應給宏逸（分潤）' : '宏逸發票帳應退東東',
                'income' => $profitShareHalf,
                'take_home' => $profitShareHalf,
            ],
        ];
    }

    public static function partnerLabel(string $partner): string
    {
        return match ($partner) {
            self::PARTNER_ATAI => '阿泰代墊',
            self::PARTNER_HONGYI => '宏逸代墊',
            default => $partner,
        };
    }

    /**
     * @return list<string>
     */
    public static function partners(): array
    {
        return [self::PARTNER_ATAI, self::PARTNER_HONGYI];
    }

    /**
     * @param  list<array<string, mixed>>  $employees
     * @return array<string, mixed>
     */
    private static function performanceTotalsFromEmployees(array $employees): array
    {
        $unitsByPrice = EmployeeRemittance::emptyTierUnitCounts();

        foreach ($employees as $employee) {
            $unitsByPrice = EmployeeRemittance::mergeTierUnitCounts(
                $unitsByPrice,
                $employee['units_by_price'] ?? EmployeeRemittance::emptyTierUnitCounts(),
            );
        }

        return [
            'completed_units' => (int) array_sum(array_column($employees, 'completed_units')),
            'units_by_price' => $unitsByPrice,
            'total_job_amount' => (int) array_sum(array_column($employees, 'total_job_amount')),
            'company_commission' => (int) array_sum(array_column($employees, 'company_commission')),
            'invoice_tax_cost' => (int) array_sum(array_column($employees, 'invoice_tax_cost')),
            'travel_allowance' => (int) array_sum(array_column($employees, 'travel_allowance')),
            'compensation_due_to_company' => (int) array_sum(array_column($employees, 'compensation_due_to_company')),
            'employee_actual_pay' => (int) array_sum(array_column($employees, 'employee_actual_pay')),
            'collect_due_from_employee' => (int) array_sum(array_column($employees, 'collect_due_from_employee')),
        ];
    }
}
