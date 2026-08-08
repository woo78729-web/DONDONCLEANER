<?php

namespace Tests\Feature\Api;

use App\Models\CleaningProject;
use App\Models\DailySchedule;
use App\Models\User;
use App\Support\TomorrowSchedulePushSupport;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\Support\CreatesScheduleTestData;
use Tests\TestCase;

class TomorrowSchedulePushApiTest extends TestCase
{
    use CreatesScheduleTestData;
    use RefreshDatabase;

    public function test_build_message_includes_maps_link_and_schedule_blocks(): void
    {
        $schedule = new DailySchedule($this->scheduleAttributes([
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '陳先生',
            'customer_phone' => '0911111111',
            'customer_address' => '台東市中華路一段1號',
            'ac_units' => 2,
            'unit_price' => 1500,
            'pricing_lines' => [[
                'ac_units' => 2,
                'unit_price' => 1500,
                'invoice_type' => 'none',
                'charge_customer_tax' => false,
            ]],
            'cleaning_price' => 3000,
        ]));

        $message = TomorrowSchedulePushSupport::buildMessage(
            '王師傅',
            '2026-08-09',
            collect([$schedule]),
        );

        $this->assertStringContainsString('📅 明日班表提醒 (2026-08-09)', $message);
        $this->assertStringContainsString('👨‍🔧 師傅：王師傅', $message);
        $this->assertStringContainsString('共有 1 件行程', $message);
        $this->assertStringContainsString('💵 明日應收合計：3,000 元', $message);
        $this->assertStringContainsString('⏰ 09:00 - 11:00', $message);
        $this->assertStringContainsString('👤 客戶：陳先生', $message);
        $this->assertStringContainsString('📞 電話：0911111111', $message);
        $this->assertStringContainsString('📍 地址：台東市中華路一段1號', $message);
        $this->assertStringContainsString('💰 應收：3,000 元', $message);
        $this->assertStringContainsString(
            '🗺️ 導航：https://www.google.com/maps/search/?api=1&query='.rawurlencode('台東市中華路一段1號'),
            $message,
        );
    }

    public function test_build_message_uses_pricing_lines_per_stop_for_multi_address(): void
    {
        $first = new DailySchedule($this->scheduleAttributes([
            'start_time' => '09:00',
            'end_time' => '10:00',
            'customer_name' => '測試',
            'customer_phone' => '0919030203',
            'customer_address' => '高雄市左營區富國路278號5樓',
            'ac_units' => 1,
            'cleaning_price' => 5500,
            'pricing_lines' => [[
                'ac_units' => 1,
                'unit_price' => 1500,
                'invoice_type' => 'none',
                'charge_customer_tax' => false,
            ]],
            'notes' => '[多址 1/2·共5離5500]',
        ]));

        $second = new DailySchedule($this->scheduleAttributes([
            'start_time' => '10:00',
            'end_time' => '14:00',
            'customer_name' => '測試',
            'customer_phone' => '0919030203',
            'customer_address' => '大昌二路150號',
            'ac_units' => 4,
            'cleaning_price' => 0,
            'pricing_lines' => [[
                'ac_units' => 4,
                'unit_price' => 1000,
                'invoice_type' => 'none',
                'charge_customer_tax' => false,
            ]],
            'notes' => '[多址 2/2·共5離5500]',
        ]));

        $message = TomorrowSchedulePushSupport::buildMessage(
            '測試人員',
            '2026-08-09',
            collect([$first, $second]),
        );

        $this->assertStringContainsString('💵 明日應收合計：5,500 元', $message);
        $this->assertStringContainsString('📍 地址：高雄市左營區富國路278號5樓', $message);
        $this->assertStringContainsString('💰 應收：1,500 元', $message);
        $this->assertStringContainsString('📍 地址：大昌二路150號', $message);
        $this->assertStringContainsString('💰 應收：4,000 元', $message);
        $this->assertStringNotContainsString('💰 應收：5,500 元', $message);
        $this->assertStringNotContainsString('💰 應收：0 元', $message);
    }

    public function test_build_message_splits_legacy_multi_address_total_on_first_stop(): void
    {
        $first = new DailySchedule($this->scheduleAttributes([
            'start_time' => '09:00',
            'end_time' => '10:00',
            'customer_name' => '測試',
            'customer_phone' => '0919030203',
            'customer_address' => '高雄市左營區富國路278號5樓',
            'ac_units' => 1,
            'cleaning_price' => 5500,
            'pricing_lines' => [],
            'notes' => '[多址 1/2·共5離5500]',
        ]));

        $second = new DailySchedule($this->scheduleAttributes([
            'start_time' => '10:00',
            'end_time' => '14:00',
            'customer_name' => '測試',
            'customer_phone' => '0919030203',
            'customer_address' => '大昌二路150號',
            'ac_units' => 4,
            'cleaning_price' => 0,
            'pricing_lines' => [],
            'notes' => '[多址 2/2·共5離5500]',
        ]));

        $message = TomorrowSchedulePushSupport::buildMessage(
            '測試人員',
            '2026-08-09',
            collect([$first, $second]),
        );

        $this->assertStringContainsString('💵 明日應收合計：5,500 元', $message);
        $this->assertStringContainsString('💰 應收：1,100 元', $message);
        $this->assertStringContainsString('💰 應收：4,400 元', $message);
        $this->assertStringNotContainsString('💰 應收：5,500 元', $message);
        $this->assertStringNotContainsString('💰 應收：0 元', $message);
    }

    public function test_command_pushes_grouped_schedules_for_bound_employees(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-08 18:00:00', 'Asia/Taipei'));

        config([
            'services.line.channel_access_token' => 'test-token',
            'services.cron.secret' => 'cron-secret',
        ]);

        Http::fake([
            'https://api.line.me/v2/bot/message/push' => Http::response(['sent' => true], 200),
        ]);

        $employee = User::query()->create([
            'account' => 'shifu1',
            'password' => Hash::make('password123'),
            'name' => '王師傅',
            'phone' => '0912345678',
            'line_user_id' => 'Ulinewang',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-08-09',
            'start_time' => '09:00',
            'end_time' => '11:00',
            'customer_name' => '客戶A',
            'customer_address' => '台東市A路1號',
        ]));

        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-08-09',
            'start_time' => '14:00',
            'end_time' => '16:00',
            'customer_name' => '客戶B',
            'customer_address' => '台東市B路2號',
        ]));

        // 行事曆占位不應推播
        DailySchedule::query()->create($this->scheduleAttributes([
            'user_id' => $employee->id,
            'work_date' => '2026-08-09',
            'schedule_kind' => CleaningProject::SCHEDULE_KIND_CALENDAR_BLOCK,
            'start_time' => '08:00',
            'end_time' => '18:00',
            'customer_name' => '占位',
            'ac_units' => 0,
            'cleaning_price' => 0,
        ]));

        $this->artisan('app:send-tomorrow-schedules')
            ->assertSuccessful();

        Http::assertSent(function ($request) {
            $text = $request['messages'][0]['text'] ?? '';

            return $request->url() === 'https://api.line.me/v2/bot/message/push'
                && $request['to'] === 'Ulinewang'
                && str_contains($text, '共有 2 件行程')
                && str_contains($text, '客戶A')
                && str_contains($text, '客戶B')
                && ! str_contains($text, '占位');
        });

        Carbon::setTestNow();
    }

    public function test_cron_endpoint_requires_secret_and_triggers_command(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-08 18:00:00', 'Asia/Taipei'));

        config([
            'services.line.channel_access_token' => 'test-token',
            'services.cron.secret' => 'cron-secret',
        ]);

        Http::fake([
            'https://api.line.me/v2/bot/message/push' => Http::response(['sent' => true], 200),
        ]);

        $this->getJson('/api/cron/send-tomorrow-schedules')
            ->assertUnauthorized();

        $this->getJson('/api/cron/send-tomorrow-schedules?token=wrong')
            ->assertUnauthorized();

        $this->getJson('/api/cron/send-tomorrow-schedules?token=cron-secret&dry_run=1')
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.dry_run', true);

        Carbon::setTestNow();
    }
}
