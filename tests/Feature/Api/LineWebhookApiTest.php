<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LineWebhookApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_bind_keyword_links_line_user_id_and_replies_success(): void
    {
        config([
            'services.line.channel_access_token' => 'test-token',
            'services.line.channel_secret' => '',
        ]);

        Http::fake([
            'https://api.line.me/v2/bot/message/reply' => Http::response(['sent' => true], 200),
        ]);

        $employee = User::query()->create([
            'account' => 'shifu1',
            'password' => Hash::make('password123'),
            'name' => '王師傅',
            'phone' => '0912-345-678',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $this->postJson('/api/line/webhook', $this->textEventPayload(
            text: '綁定 0912345678',
            lineUserId: 'U1234567890abcdef',
            replyToken: 'reply-token-1',
        ))
            ->assertOk()
            ->assertJsonPath('status', 'ok');

        $this->assertSame('U1234567890abcdef', $employee->fresh()->line_user_id);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.line.me/v2/bot/message/reply'
                && $request->hasHeader('Authorization', 'Bearer test-token')
                && $request['replyToken'] === 'reply-token-1'
                && str_contains($request['messages'][0]['text'], '綁定成功！您好，王師傅');
        });
    }

    public function test_bind_updates_all_accounts_sharing_the_same_phone(): void
    {
        config([
            'services.line.channel_access_token' => 'test-token',
            'services.line.channel_secret' => '',
        ]);

        Http::fake([
            'https://api.line.me/v2/bot/message/reply' => Http::response(['sent' => true], 200),
        ]);

        $admin = User::query()->create([
            'account' => 'admin1',
            'password' => Hash::make('password123'),
            'name' => '王管理員',
            'phone' => '0912345678',
            'role' => 'admin',
            'is_active' => true,
        ]);

        $employee = User::query()->create([
            'account' => 'shifu1',
            'password' => Hash::make('password123'),
            'name' => '王師傅',
            'phone' => '0912-345-678',
            'role' => 'employee',
            'is_active' => true,
            'rules_accepted_at' => now(),
            'must_change_password' => false,
        ]);

        $this->postJson('/api/line/webhook', $this->textEventPayload(
            text: '綁定 0912345678',
            lineUserId: 'Usharedlineid',
            replyToken: 'reply-token-shared',
        ))->assertOk();

        $this->assertSame('Usharedlineid', $admin->fresh()->line_user_id);
        $this->assertSame('Usharedlineid', $employee->fresh()->line_user_id);

        Http::assertSent(function ($request) {
            return str_contains($request['messages'][0]['text'], '綁定成功！您好，王師傅');
        });
    }

    public function test_bind_unknown_phone_replies_not_found(): void
    {
        config([
            'services.line.channel_access_token' => 'test-token',
            'services.line.channel_secret' => '',
        ]);

        Http::fake([
            'https://api.line.me/v2/bot/message/reply' => Http::response(['sent' => true], 200),
        ]);

        $this->postJson('/api/line/webhook', $this->textEventPayload(
            text: '綁定 0987654321',
            lineUserId: 'Uabcdef',
            replyToken: 'reply-token-2',
        ))->assertOk();

        Http::assertSent(function ($request) {
            return $request['messages'][0]['text'] === '找不到此手機號碼，請確認後再試一次。';
        });
    }

    public function test_rejects_invalid_signature_when_secret_configured(): void
    {
        config([
            'services.line.channel_access_token' => 'test-token',
            'services.line.channel_secret' => 'channel-secret',
        ]);

        $this->postJson('/api/line/webhook', $this->textEventPayload(
            text: '綁定 0912345678',
            lineUserId: 'Uabcdef',
            replyToken: 'reply-token-3',
        ), [
            'X-Line-Signature' => 'invalid',
        ])
            ->assertForbidden();
    }

    /**
     * @return array<string, mixed>
     */
    private function textEventPayload(string $text, string $lineUserId, string $replyToken): array
    {
        return [
            'events' => [
                [
                    'type' => 'message',
                    'replyToken' => $replyToken,
                    'source' => [
                        'type' => 'user',
                        'userId' => $lineUserId,
                    ],
                    'message' => [
                        'type' => 'text',
                        'text' => $text,
                    ],
                ],
            ],
        ];
    }
}
