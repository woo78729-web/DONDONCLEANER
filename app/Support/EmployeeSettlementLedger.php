<?php

namespace App\Support;

class EmployeeSettlementLedger
{
    /**
     * @return array<string, mixed>
     */
    public static function build(string $yearMonth, ?int $userId = null): array
    {
        $summary = MonthlyAccounting::buildSummary($yearMonth);
        $employees = $summary['employees'];

        if ($userId !== null) {
            $employees = array_values(array_filter(
                $employees,
                fn (array $employee) => (int) $employee['user_id'] === $userId,
            ));
        }

        $detailRows = [];

        foreach ($employees as $employee) {
            foreach ($employee['reports'] as $report) {
                $collect = (int) ($report['collect_from_employee'] ?? 0);
                $advance = (int) ($report['advance_to_employee'] ?? 0);
                $net = $collect - $advance;
                $paidToCompany = (bool) ($report['paid_to_company'] ?? false);

                $detailRows[] = [
                    'user_id' => (int) $employee['user_id'],
                    'employee_name' => $employee['name'],
                    'report_id' => (int) $report['report_id'],
                    'work_date' => $report['work_date'],
                    'customer_name' => $report['customer_name'],
                    'task_details' => $report['task_details'],
                    'paid_to_company' => $paidToCompany,
                    'payment_mode' => $paidToCompany ? 'remittance' : 'cash',
                    'payment_mode_label' => $paidToCompany ? '匯款' : '現金',
                    'completed_units' => (int) ($report['completed_units'] ?? 0),
                    'units_by_price' => $report['units_by_price'] ?? EmployeeRemittance::emptyTierUnitCounts(),
                    'total_job_amount' => (int) ($report['total_job_amount'] ?? 0),
                    'employee_cash_received' => (int) ($report['employee_cash_received'] ?? 0),
                    'collect_from_employee' => $collect,
                    'invoice_surcharge_due' => (int) ($report['invoice_surcharge_due'] ?? 0),
                    'advance_to_employee' => $advance,
                    'net_settlement' => $net,
                    'payment_to_finance' => max(0, $net),
                    'payout_from_finance' => max(0, -$net),
                    'company_inbound_expected' => (int) ($report['company_inbound_expected'] ?? 0),
                    'company_transfer' => (int) ($report['company_transfer'] ?? 0),
                    'remittance_status_label' => $report['remittance_status_label'] ?? null,
                ];
            }
        }

        usort($detailRows, function (array $a, array $b) {
            $dateCompare = strcmp((string) $a['work_date'], (string) $b['work_date']);

            if ($dateCompare !== 0) {
                return $dateCompare;
            }

            $nameCompare = strcmp((string) $a['employee_name'], (string) $b['employee_name']);

            if ($nameCompare !== 0) {
                return $nameCompare;
            }

            return $a['report_id'] <=> $b['report_id'];
        });

        $dailyRows = self::aggregateByDay($detailRows);
        $totals = self::summarizeRows($detailRows);

        return [
            'year_month' => $yearMonth,
            'date_from' => $summary['date_from'],
            'date_to' => $summary['date_to'],
            'user_id' => $userId,
            'detail_rows' => $detailRows,
            'daily_rows' => $dailyRows,
            'totals' => $totals,
            'employee_summaries' => array_map(fn (array $employee) => [
                'user_id' => (int) $employee['user_id'],
                'name' => $employee['name'],
                'collect_from_employee' => (int) $employee['collect_from_employee'],
                'advance_to_employee' => (int) $employee['advance_to_employee'],
                'payment_to_finance' => (int) $employee['payment_to_finance'],
                'payout_from_finance' => (int) $employee['payout_from_finance'],
                'collect_due_from_employee' => (int) $employee['collect_due_from_employee'],
            ], $employees),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $detailRows
     * @return list<array<string, mixed>>
     */
    private static function aggregateByDay(array $detailRows): array
    {
        /** @var array<string, array<string, mixed>> $grouped */
        $grouped = [];

        foreach ($detailRows as $row) {
            $key = $row['user_id'].'|'.$row['work_date'];

            if (! isset($grouped[$key])) {
                $grouped[$key] = [
                    'user_id' => (int) $row['user_id'],
                    'employee_name' => $row['employee_name'],
                    'work_date' => $row['work_date'],
                    'report_count' => 0,
                    'completed_units' => 0,
                    'units_by_price' => EmployeeRemittance::emptyTierUnitCounts(),
                    'total_job_amount' => 0,
                    'employee_cash_received' => 0,
                    'collect_from_employee' => 0,
                    'invoice_surcharge_due' => 0,
                    'advance_to_employee' => 0,
                    'net_settlement' => 0,
                    'payment_to_finance' => 0,
                    'payout_from_finance' => 0,
                    'cash_report_count' => 0,
                    'remittance_report_count' => 0,
                ];
            }

            $grouped[$key]['report_count']++;
            $grouped[$key]['completed_units'] += (int) $row['completed_units'];
            $grouped[$key]['units_by_price'] = EmployeeRemittance::mergeTierUnitCounts(
                $grouped[$key]['units_by_price'],
                $row['units_by_price'] ?? EmployeeRemittance::emptyTierUnitCounts(),
            );
            $grouped[$key]['total_job_amount'] += (int) $row['total_job_amount'];
            $grouped[$key]['employee_cash_received'] += (int) $row['employee_cash_received'];
            $grouped[$key]['collect_from_employee'] += (int) $row['collect_from_employee'];
            $grouped[$key]['invoice_surcharge_due'] += (int) $row['invoice_surcharge_due'];
            $grouped[$key]['advance_to_employee'] += (int) $row['advance_to_employee'];

            if ($row['paid_to_company']) {
                $grouped[$key]['remittance_report_count']++;
            } else {
                $grouped[$key]['cash_report_count']++;
            }
        }

        $dailyRows = array_values($grouped);

        foreach ($dailyRows as &$row) {
            $net = (int) $row['collect_from_employee'] - (int) $row['advance_to_employee'];
            $row['net_settlement'] = $net;
            $row['payment_to_finance'] = max(0, $net);
            $row['payout_from_finance'] = max(0, -$net);
        }
        unset($row);

        usort($dailyRows, function (array $a, array $b) {
            $dateCompare = strcmp((string) $a['work_date'], (string) $b['work_date']);

            if ($dateCompare !== 0) {
                return $dateCompare;
            }

            return strcmp((string) $a['employee_name'], (string) $b['employee_name']);
        });

        return $dailyRows;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, int|array<string, int>>
     */
    private static function summarizeRows(array $rows): array
    {
        $unitsByPrice = EmployeeRemittance::emptyTierUnitCounts();

        foreach ($rows as $row) {
            $unitsByPrice = EmployeeRemittance::mergeTierUnitCounts(
                $unitsByPrice,
                $row['units_by_price'] ?? EmployeeRemittance::emptyTierUnitCounts(),
            );
        }

        $collect = (int) array_sum(array_column($rows, 'collect_from_employee'));
        $advance = (int) array_sum(array_column($rows, 'advance_to_employee'));
        $net = $collect - $advance;

        return [
            'completed_units' => (int) array_sum(array_column($rows, 'completed_units')),
            'units_by_price' => $unitsByPrice,
            'total_job_amount' => (int) array_sum(array_column($rows, 'total_job_amount')),
            'employee_cash_received' => (int) array_sum(array_column($rows, 'employee_cash_received')),
            'collect_from_employee' => $collect,
            'invoice_surcharge_due' => (int) array_sum(array_column($rows, 'invoice_surcharge_due')),
            'advance_to_employee' => $advance,
            'net_settlement' => $net,
            'payment_to_finance' => max(0, $net),
            'payout_from_finance' => max(0, -$net),
        ];
    }
}
