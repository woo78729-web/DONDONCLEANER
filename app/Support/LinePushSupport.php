<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class LinePushSupport
{
    public static function pushText(string $lineUserId, string $text): bool
    {
        $token = (string) config('services.line.channel_access_token');

        if ($token === '' || $lineUserId === '' || $text === '') {
            Log::warning('LINE push skipped: missing token, user id, or text');

            return false;
        }

        // LINE 單則文字上限 5000 字
        if (mb_strlen($text) > 5000) {
            $text = mb_substr($text, 0, 4990)."\n…（內容過長已截斷）";
        }

        $response = Http::withToken($token)
            ->acceptJson()
            ->post('https://api.line.me/v2/bot/message/push', [
                'to' => $lineUserId,
                'messages' => [
                    [
                        'type' => 'text',
                        'text' => $text,
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::warning('LINE push API failed', [
                'line_user_id' => $lineUserId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;
        }

        return true;
    }
}
