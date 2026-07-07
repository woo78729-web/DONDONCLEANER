<?php

namespace App\Support;

use App\Models\CompanyRemittance;
use App\Models\DailyReport;
use App\Models\FundAccount;
use App\Models\FundTransaction;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class FundLedgerSupport
{
    /**
     * @return array{
     *     expected_amount:int,
     *     confirmed_amount:int,
     *     pending_amount:int,
     *     items:list<array<string, mixed>>
     * }
     */
    public static function hongyiReceivablesForMonth(int $year, int $month): array
    {
        $remittances = CompanyRemittanceSupport::monthQuery($year, $month)
            ->with(['report.dailySchedule', 'cleaningProject'])
            ->orderBy('expected_remittance_date')
            ->orderBy('id')
            ->get();

        $items = $remittances->map(function (CompanyRemittance $remittance) {
            $payload = CompanyRemittanceSupport::payload($remittance);

            return [
                'remittance_id' => $remittance->id,
                'amount' => (int) $remittance->amount,
                'status' => $remittance->status,
                'status_label' => CompanyRemittanceSupport::statusLabel($remittance->status),
                'is_confirmed' => $remittance->status === CompanyRemittance::STATUS_CONFIRMED,
                'expected_remittance_date' => $payload['expected_remittance_date'],
                'customer_name' => $payload['customer_name'],
                'employee_name' => $payload['employee_name'],
                'cleaning_project_id' => $remittance->cleaning_project_id,
                'fund_transaction_id' => $remittance->fund_transaction_id,
            ];
        })->values()->all();

        $expectedAmount = (int) $remittances->sum('amount');
        $confirmedAmount = (int) $remittances
            ->where('status', CompanyRemittance::STATUS_CONFIRMED)
            ->sum('amount');
        $pendingAmount = (int) $remittances
            ->whereIn('status', [CompanyRemittance::STATUS_PENDING, CompanyRemittance::STATUS_REMINDED])
            ->sum('amount');

        return [
            'expected_amount' => $expectedAmount,
            'confirmed_amount' => $confirmedAmount,
            'pending_amount' => $pendingAmount,
            'items' => $items,
        ];
    }

    /**
     * @return array{posted_amount:int, transaction_count:int}
     */
    public static function postedHongyiInflowForMonth(int $year, int $month): array
    {
        $account = self::accountByCode(FundAccount::CODE_HONGYI);
        $from = Carbon::create($year, $month, 1)->startOfDay();
        $to = $from->copy()->endOfMonth();

        $query = FundTransaction::query()
            ->where('event_type', FundTransaction::EVENT_CUSTOMER_REMITTANCE_IN)
            ->where('to_account_id', $account->id)
            ->where('status', FundTransaction::STATUS_POSTED)
            ->whereBetween('occurred_at', [$from, $to]);

        return [
            'posted_amount' => (int) $query->sum('amount'),
            'transaction_count' => (int) $query->count(),
        ];
    }

    /**
     * @return array{posted_amount:int, transaction_count:int}
     */
    public static function postedDongdongCashInflowForMonth(int $year, int $month): array
    {
        $account = self::accountByCode(FundAccount::CODE_DONGDONG);
        $from = Carbon::create($year, $month, 1)->startOfDay();
        $to = $from->copy()->endOfMonth();

        $query = FundTransaction::query()
            ->where('event_type', FundTransaction::EVENT_CUSTOMER_CASH_IN)
            ->where('to_account_id', $account->id)
            ->where('status', FundTransaction::STATUS_POSTED)
            ->whereBetween('occurred_at', [$from, $to]);

        return [
            'posted_amount' => (int) $query->sum('amount'),
            'transaction_count' => (int) $query->count(),
        ];
    }

    public static function accountByCode(string $code): FundAccount
    {
        $account = FundAccount::query()->where('code', $code)->first();

        if (! $account) {
            throw new \RuntimeException("Fund account [{$code}] is not configured.");
        }

        return $account;
    }

    /**
     * @return array<string, mixed>
     */
    public static function transactionPayload(FundTransaction $transaction): array
    {
        $transaction->loadMissing(['fromAccount', 'toAccount']);

        return [
            'id' => $transaction->id,
            'transaction_no' => $transaction->transaction_no,
            'event_type' => $transaction->event_type,
            'from_account_code' => $transaction->fromAccount?->code,
            'from_account_name' => $transaction->fromAccount?->name,
            'to_account_code' => $transaction->toAccount?->code,
            'to_account_name' => $transaction->toAccount?->name,
            'amount' => (int) $transaction->amount,
            'status' => $transaction->status,
            'occurred_at' => $transaction->occurred_at?->toDateTimeString(),
            'posted_at' => $transaction->posted_at?->toDateTimeString(),
            'source_type' => $transaction->source_type,
            'source_id' => $transaction->source_id,
            'meta' => $transaction->meta,
            'notes' => $transaction->notes,
        ];
    }

    public static function findByIdempotencyKey(string $key): ?FundTransaction
    {
        return FundTransaction::query()->where('idempotency_key', $key)->first();
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    public static function postTransfer(
        string $eventType,
        ?FundAccount $from,
        ?FundAccount $to,
        int $amount,
        string $idempotencyKey,
        string $sourceType,
        int $sourceId,
        Carbon $occurredAt,
        array $meta = [],
        ?int $createdBy = null,
        ?string $notes = null,
    ): FundTransaction {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Fund transaction amount must be greater than zero.');
        }

        $existing = self::findByIdempotencyKey($idempotencyKey);

        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use (
            $eventType,
            $from,
            $to,
            $amount,
            $idempotencyKey,
            $sourceType,
            $sourceId,
            $occurredAt,
            $meta,
            $createdBy,
            $notes,
        ) {
            $duplicate = self::findByIdempotencyKey($idempotencyKey);

            if ($duplicate) {
                return $duplicate;
            }

            $transaction = FundTransaction::query()->create([
                'transaction_no' => self::nextTransactionNo($occurredAt),
                'event_type' => $eventType,
                'from_account_id' => $from?->id,
                'to_account_id' => $to?->id,
                'amount' => $amount,
                'status' => FundTransaction::STATUS_POSTED,
                'occurred_at' => $occurredAt,
                'posted_at' => now(),
                'idempotency_key' => $idempotencyKey,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'meta' => $meta,
                'created_by' => $createdBy,
                'notes' => $notes,
            ]);

            return $transaction;
        });
    }

    private static function nextTransactionNo(Carbon $occurredAt): string
    {
        $prefix = 'FT'.$occurredAt->format('Ymd');

        $latest = FundTransaction::query()
            ->where('transaction_no', 'like', $prefix.'-%')
            ->orderByDesc('id')
            ->value('transaction_no');

        $sequence = 1;

        if (is_string($latest) && preg_match('/-(\d+)$/', $latest, $matches)) {
            $sequence = ((int) $matches[1]) + 1;
        }

        return sprintf('%s-%04d', $prefix, $sequence);
    }
}
