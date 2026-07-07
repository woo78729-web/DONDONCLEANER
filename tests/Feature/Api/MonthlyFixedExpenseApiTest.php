<?php

namespace Tests\Feature\Api;

use App\Models\AccountingSetting;
use App\Models\MonthlyFixedExpense;
use App\Models\User;
use App\Support\MonthlyAccounting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonthlyFixedExpenseApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '管理員',
            'role' => 'admin',
            'is_active' => true,
        ]);
    }

    public function test_unsaved_month_settlement_uses_zero_fixed_expenses(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        $yearMonth = now()->format('Y-m');

        $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.fixed_expenses_saved', false)
            ->assertJsonPath('data.fixed_expenses.0.amount', 0)
            ->assertJsonPath('data.fixed_expenses.1.amount', 0)
            ->assertJsonPath('data.fixed_expenses.2.amount', 0)
            ->assertJsonPath('data.fixed_expenses.3.amount', 0)
            ->assertJsonPath('data.totals.fixed_expense_total', 0)
            ->assertJsonPath('data.totals.atai_advance_fixed_total', 0);
    }

    public function test_draft_prefills_from_previous_month_saved_snapshot(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        $previousMonth = now()->subMonth()->format('Y-m');
        $currentMonth = now()->format('Y-m');

        MonthlyFixedExpense::query()->create([
            'year_month' => $previousMonth,
            'expense_control' => 1111,
            'expense_phone' => 222,
            'expense_ai' => 333,
            'expense_ad' => 4444,
        ]);

        $this->getJson('/api/admin/accounting?year_month='.$currentMonth)
            ->assertOk()
            ->assertJsonPath('data.fixed_expenses_saved', false)
            ->assertJsonPath('data.fixed_expenses_source', 'draft_previous_month')
            ->assertJsonPath('data.fixed_expense_drafts.0.amount', 1111)
            ->assertJsonPath('data.fixed_expense_drafts.1.amount', 222)
            ->assertJsonPath('data.fixed_expenses.0.amount', 0);
    }

    public function test_saving_july_does_not_change_june_settlement(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        $june = now()->subMonth()->format('Y-m');
        $july = now()->format('Y-m');

        MonthlyFixedExpense::query()->create([
            'year_month' => $june,
            'expense_control' => 8000,
            'expense_phone' => 400,
            'expense_ai' => 700,
            'expense_ad' => 10500,
        ]);

        $this->patchJson('/api/admin/accounting/settings', [
            'year_month' => $july,
            'expenses' => [
                ['key' => 'expense_control', 'amount' => 9999, 'label' => '管控開支'],
                ['key' => 'expense_phone', 'amount' => 999, 'label' => '電話費'],
                ['key' => 'expense_ai', 'amount' => 888, 'label' => 'AI 開支'],
                ['key' => 'expense_ad', 'amount' => 7777, 'label' => '廣告'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.fixed_expenses_saved', true)
            ->assertJsonPath('data.fixed_expenses.0.amount', 9999);

        $this->getJson('/api/admin/accounting?year_month='.$june)
            ->assertOk()
            ->assertJsonPath('data.fixed_expenses_saved', true)
            ->assertJsonPath('data.fixed_expenses.0.amount', 8000)
            ->assertJsonPath('data.fixed_expenses.1.amount', 400)
            ->assertJsonPath('data.totals.fixed_expense_total', 19600);
    }

    public function test_backfill_does_not_overwrite_existing_snapshots(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        AccountingSetting::query()->where('key', 'expense_control')->update(['amount' => 5000]);

        $targetMonth = now()->subMonths(2)->format('Y-m');

        MonthlyFixedExpense::query()->create([
            'year_month' => $targetMonth,
            'expense_control' => 1234,
            'expense_phone' => 400,
            'expense_ai' => 700,
            'expense_ad' => 10500,
        ]);

        Artisan::call('accounting:backfill-monthly-fixed-expenses', [
            '--from' => $targetMonth,
            '--to' => $targetMonth,
        ]);

        $record = MonthlyFixedExpense::query()->where('year_month', $targetMonth)->first();

        $this->assertSame(1234, $record->expense_control);
    }

    public function test_backfill_creates_missing_month_from_global_settings(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        AccountingSetting::query()->where('key', 'expense_control')->update(['amount' => 6000]);

        $targetMonth = now()->subMonths(2)->format('Y-m');

        $this->assertNull(MonthlyFixedExpense::query()->where('year_month', $targetMonth)->first());

        Artisan::call('accounting:backfill-monthly-fixed-expenses', [
            '--from' => $targetMonth,
            '--to' => $targetMonth,
        ]);

        $record = MonthlyFixedExpense::query()->where('year_month', $targetMonth)->first();

        $this->assertNotNull($record);
        $this->assertSame(6000, $record->expense_control);
        $this->assertSame(400, $record->expense_phone);
    }

    public function test_saved_month_includes_fixed_expense_auto_advance_entries(): void
    {
        Sanctum::actingAs($this->admin);

        MonthlyAccounting::ensureDefaultSettings();

        $yearMonth = now()->format('Y-m');

        MonthlyFixedExpense::query()->create([
            'year_month' => $yearMonth,
            'expense_control' => 8000,
            'expense_phone' => 400,
            'expense_ai' => 700,
            'expense_ad' => 10500,
        ]);

        $response = $this->getJson('/api/admin/accounting?year_month='.$yearMonth)
            ->assertOk()
            ->assertJsonPath('data.fixed_expenses_saved', true)
            ->assertJsonPath('data.totals.atai_advance_fixed_total', 19600);

        $autoAdvances = $response->json('data.auto_advance_entries');
        $controlEntry = collect($autoAdvances)->firstWhere('fixed_expense_key', 'expense_control');

        $this->assertNotNull($controlEntry);
        $this->assertSame(8000, $controlEntry['amount']);
        $this->assertTrue($controlEntry['fixed_expense']);
    }
}
