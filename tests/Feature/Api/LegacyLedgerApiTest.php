<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LegacyLedgerApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_import_and_query_legacy_ledger(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $payload = [
            'year_month' => '2024-06',
            'groups' => [
                [
                    'group_key' => 'jun',
                    'daily_units' => [
                        '1' => ['1500' => 0, '1300' => 1, '1000' => 2],
                        '2' => ['1500' => 0, '1300' => 0, '1000' => 1],
                    ],
                    'total_revenue' => 49800,
                    'gross_profit' => 21000,
                    'net_profit' => 3500,
                    'hongyi_share' => 1750,
                ],
                [
                    'group_key' => 'qian',
                    'daily_units' => [
                        '19' => ['1500' => 0, '1300' => 0, '1000' => 3],
                    ],
                ],
            ],
            'advances' => [
                ['partner' => 'atai', 'label' => '廣告', 'amount' => 10500],
            ],
        ];

        $this->postJson('/api/admin/legacy-ledgers/import', $payload)
            ->assertCreated()
            ->assertJsonPath('data.year_month', '2024-06');

        $this->getJson('/api/admin/legacy-ledgers/month?year_month=2024-06')
            ->assertOk()
            ->assertJsonPath('data.groups.0.group_label', '鈞')
            ->assertJsonPath('data.groups.0.ledger.total_revenue', 49800)
            ->assertJsonPath('data.advances.0.amount', 10500);

        $this->getJson('/api/admin/legacy-ledgers/trends?from_year=2024&to_year=2024')
            ->assertOk()
            ->assertJsonPath('data.company_totals.0.total_units', 7);

        $this->deleteJson('/api/admin/legacy-ledgers/month?year_month=2024-06')
            ->assertOk();

        $this->getJson('/api/admin/legacy-ledgers/months')
            ->assertOk()
            ->assertJsonPath('data.months', []);
    }

    public function test_admin_can_import_bulk_legacy_ledger(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $payload = [
            'months' => [
                [
                    'year_month' => '2024-01',
                    'groups' => [
                        [
                            'group_key' => 'jun',
                            'daily_units' => ['1' => ['1500' => 0, '1300' => 0, '1000' => 2]],
                        ],
                    ],
                    'advances' => [
                        ['partner' => 'atai', 'label' => '廣告', 'amount' => 5000],
                    ],
                ],
                [
                    'year_month' => '2024-02',
                    'groups' => [
                        [
                            'group_key' => 'qian',
                            'daily_units' => ['3' => ['1500' => 0, '1300' => 0, '1000' => 1]],
                        ],
                    ],
                ],
            ],
        ];

        $this->postJson('/api/admin/legacy-ledgers/import-bulk', $payload)
            ->assertCreated()
            ->assertJsonPath('data.imported_count', 2)
            ->assertJsonPath('data.months.0', '2024-01')
            ->assertJsonPath('data.months.1', '2024-02');

        $this->getJson('/api/admin/legacy-ledgers/months')
            ->assertOk()
            ->assertJsonCount(2, 'data.months');
    }
}
