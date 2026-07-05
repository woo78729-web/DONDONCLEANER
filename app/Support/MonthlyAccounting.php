<?php

namespace App\Support;

use App\Models\AccountingSetting;
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
        $fixedExpenses = self::fixedExpensePayload();
        $mailRecipientCount = self::countMailRecipientsForMonth((int) $year, (int) $month);
        $manualPostageEntries = ManualPostageEntry::query()
            ->where('year_month', $yearMonth)
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

        $companyTransfers = self::companyTransfersFromEmployees($employeeSummaries);
        $totals['company_transfer_count'] = count($companyTransfers);
        $totals['company_inbound_expected'] = (int) array_sum(array_column($employeeSummaries, 'company_inbound_expected'));
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
                'dailySchedule' => fn ($query) => $query->with('user:id,name,account,avatar_path'),
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
        $keys = [];

        DailySchedule::query()
            ->whereYear('work_date', $year)
            ->whereMonth('work_date', $month)
            ->where(function ($builder) {
                $builder
                    ->where('needs_mail', true)
                    ->orWhere('needs_invoice', true)
                    ->orWhere('needs_receipt', true);
            })
            ->each(function (DailySchedule $schedule) use (&$keys) {
                $keys[MailRecipientSupport::customerPostageKey($schedule)] = true;
            });

        DailyReport::query()
            ->with('dailySchedule')
            ->where(function ($builder) {
                $builder
                    ->where('needs_invoice_and_mail', true)
                    ->orWhere('needs_receipt_and_mail', true);
            })
            ->whereHas('dailySchedule', function ($query) use ($year, $month) {
                $query->whereYear('work_date', $year)->whereMonth('work_date', $month);
            })
            ->each(function (DailyReport $report) use (&$keys) {
                $schedule = $report->dailySchedule;

                if ($schedule) {
                    $keys[MailRecipientSupport::customerPostageKey($schedule)] = true;
                }
            });

        return count($keys);
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
                'partner' => self::PARTNER_ATAI,
                'partner_label' => self::partnerLabel(self::PARTNER_ATAI),
                'label' => self::AUTO_INVOICE_TAX_LABEL,
                'amount' => $autoInvoiceTax,
                'notes' => '當月開發票案件自動帶入',
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
            $companyInboundExpected = $report->paid_to_company ? (int) $summary['company_transfer'] : 0;
            $companyTransferConfirmed = ($report->paid_to_company && CompanyRemittanceSupport::countsTowardHongyiAccount($report))
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
     * @param  list<array<string, mixed>>  $employees
     * @return list<array<string, mixed>>
     */
    private static function companyTransfersFromEmployees(array $employees): array
    {
        $transfers = [];

        foreach ($employees as $employee) {
            foreach ($employee['reports'] ?? [] as $report) {
                if ((int) ($report['company_inbound_expected'] ?? 0) <= 0) {
                    continue;
                }

                $transfers[] = [
                    'report_id' => $report['report_id'],
                    'work_date' => $report['work_date'],
                    'employee_name' => $employee['name'],
                    'customer_name' => $report['customer_name'] ?? null,
                    'task_details' => $report['task_details'] ?? null,
                    'completed_units' => (int) ($report['completed_units'] ?? 0),
                    'needs_invoice' => (bool) ($report['needs_invoice'] ?? false),
                    'amount' => (int) $report['company_inbound_expected'],
                    'confirmed_amount' => (int) ($report['company_transfer'] ?? 0),
                    'advance_to_employee' => (int) ($report['advance_to_employee'] ?? 0),
                    'remittance_status' => $report['remittance_status'] ?? null,
                    'remittance_status_label' => $report['remittance_status_label'] ?? '待入帳',
                ];
            }
        }

        usort($transfers, fn ($a, $b) => strcmp((string) $a['work_date'], (string) $b['work_date'])
            ?: strcmp((string) $a['employee_name'], (string) $b['employee_name']));

        return $transfers;
    }

    /**
     * @return list<array{key:string, label:string, amount:int}>
     */
    private static function fixedExpensePayload(): array
    {
        $defaults = collect(self::defaultFixedExpenses())->keyBy('key');
        $stored = AccountingSetting::query()
            ->whereIn('key', $defaults->keys())
            ->get()
            ->keyBy('key');

        return $defaults->map(function (array $default) use ($stored) {
            $setting = $stored->get($default['key']);

            return [
                'key' => $default['key'],
                'label' => $setting?->label ?? $default['label'],
                'amount' => (int) ($setting?->amount ?? $default['amount']),
            ];
        })->values()->all();
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
        $invoiceTaxCost = $autoInvoiceTax;
        $fixedExpenseTotal = array_sum(array_column($fixedExpenses, 'amount'));
        $manualAtaiAdvances = (int) $entries->where('partner', self::PARTNER_ATAI)->sum('amount');
        $manualHongyiAdvances = (int) $entries->where('partner', self::PARTNER_HONGYI)->sum('amount');
        $ataiAdvances = $manualAtaiAdvances + $autoInvoiceTax + $fixedExpenseTotal + $travelAllowanceTotal;
        $hongyiAdvances = $manualHongyiAdvances;
        $advanceEntryTotal = $manualAtaiAdvances + $manualHongyiAdvances + $autoInvoiceTax + $travelAllowanceTotal;
        $monthlyExpenseTotal = $fixedExpenseTotal + $autoPostage + $advanceEntryTotal;
        $grossProfit = $netFromEmployees - $monthlyExpenseTotal;
        $profitShareHalf = (int) round($grossProfit / 2);
        $ataiShare = $profitShareHalf;
        $hongyiShare = $profitShareHalf - $companyInboundExpected;
        $ataiNetBalance = $ataiShare - $ataiAdvances;

        return [
            'collect_from_employees' => $collectFromEmployees,
            'advance_to_employees' => $advanceToEmployees,
            'net_from_employees_jobs' => $jobNetFromEmployees,
            'compensation_due_to_company_total' => $compensationDueToCompany,
            'net_from_employees' => $netFromEmployees,
            'company_transfer' => $companyTransferConfirmed,
            'company_inbound_expected' => $companyInboundExpected,
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
                'monthly_expense_total' => (int) $totals['monthly_expense_total'],
                'gross_profit' => (int) $totals['gross_profit'],
                'profit_share_half' => $profitShareHalf,
                'travel_allowance_total' => (int) ($totals['travel_allowance_total'] ?? 0),
            ],
            'inter_partner' => [
                'profit_share_half' => $profitShareHalf,
                'customer_remittance_in_account' => $companyInboundExpected,
                'settlement_amount' => abs($interPartnerSettlement),
                'direction' => $interPartnerSettlement >= 0 ? 'dongdong_to_hongyi' : 'hongyi_to_dongdong',
                'direction_label' => $interPartnerSettlement >= 0
                    ? '東東應補給宏逸'
                    : '宏逸應退東東',
                'formula_hint' => '每人分潤 − 發票帳客戶匯款；正數表示東東補差額，負數表示宏逸退還東東',
            ],
            'atai' => [
                'account_label' => '東東公司帳（阿泰代管）',
                'profit_share_half' => $profitShareHalf,
                'profit_share_settled' => $profitShareHalf,
                'invoice_tax_company_advance' => $invoiceTaxCost,
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
