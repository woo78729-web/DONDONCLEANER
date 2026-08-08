<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class LineWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (! $this->verifySignature($request)) {
            return $this->error('Invalid LINE signature', 403);
        }

        $events = $request->input('events', []);

        if (! is_array($events)) {
            return response()->json(['status' => 'ok']);
        }

        foreach ($events as $event) {
            if (! is_array($event)) {
                continue;
            }

            $this->handleEvent($event);
        }

        // LINE 要求快速回應 200；實際回覆走 Reply API
        return response()->json(['status' => 'ok']);
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function handleEvent(array $event): void
    {
        if (($event['type'] ?? null) !== 'message') {
            return;
        }

        if (($event['message']['type'] ?? null) !== 'text') {
            return;
        }

        $text = trim((string) ($event['message']['text'] ?? ''));
        $lineUserId = (string) ($event['source']['userId'] ?? '');
        $replyToken = (string) ($event['replyToken'] ?? '');

        if ($text === '' || $lineUserId === '' || $replyToken === '') {
            return;
        }

        if (! preg_match('/^綁定\s*(.+)$/u', $text, $matches)) {
            return;
        }

        $phoneInput = trim($matches[1]);
        $normalizedPhone = $this->normalizePhone($phoneInput);

        if ($normalizedPhone === '') {
            $this->reply($replyToken, '找不到此手機號碼，請確認後再試一次。');

            return;
        }

        $employee = $this->findEmployeeByPhone($normalizedPhone);

        if (! $employee) {
            $this->reply($replyToken, '找不到此手機號碼，請確認後再試一次。');

            return;
        }

        // 同一個 LINE 帳號只綁一位員工
        User::query()
            ->where('line_user_id', $lineUserId)
            ->where('id', '!=', $employee->id)
            ->update(['line_user_id' => null]);

        $employee->line_user_id = $lineUserId;
        $employee->save();

        $this->reply(
            $replyToken,
            "綁定成功！您好，{$employee->name}，以後明天的班表都會自動傳送到這裡囉！"
        );
    }

    private function findEmployeeByPhone(string $normalizedPhone): ?User
    {
        return User::query()
            ->where('role', 'employee')
            ->where('is_active', true)
            ->whereNotNull('phone')
            ->get()
            ->first(function (User $user) use ($normalizedPhone) {
                return $this->normalizePhone((string) $user->phone) === $normalizedPhone;
            });
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    private function reply(string $replyToken, string $message): void
    {
        $token = (string) config('services.line.channel_access_token');

        if ($token === '') {
            Log::warning('LINE reply skipped: LINE_BOT_CHANNEL_ACCESS_TOKEN is empty');

            return;
        }

        $response = Http::withToken($token)
            ->acceptJson()
            ->post('https://api.line.me/v2/bot/message/reply', [
                'replyToken' => $replyToken,
                'messages' => [
                    [
                        'type' => 'text',
                        'text' => $message,
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::warning('LINE reply API failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        }
    }

    private function verifySignature(Request $request): bool
    {
        $secret = (string) config('services.line.channel_secret');

        // 未設定 Channel Secret 時略過驗證（方便本機測試）；正式環境請務必設定
        if ($secret === '') {
            return true;
        }

        $signature = (string) $request->header('X-Line-Signature', '');
        $body = $request->getContent();
        $hash = base64_encode(hash_hmac('sha256', $body, $secret, true));

        return hash_equals($hash, $signature);
    }
}
