<?php

namespace App\Support;

class TaitungServiceArea
{
    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            'taitung_city' => '台東市',
            'beinan' => '卑南',
            'luye' => '鹿野',
            'guanshan' => '關山',
            'haiduan' => '海端',
            'yanping' => '延平',
            'donghe' => '東河',
            'chenggong' => '成功',
            'changbin' => '長濱',
            'chishang' => '池上',
            'taimali' => '太麻里',
            'dawu' => '大武',
            'daren' => '達仁',
            'jinfeng' => '金峰',
            'ludao' => '綠島',
            'lanyu' => '蘭嶼',
        ];
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_keys(self::options());
    }

    public static function label(?string $value): string
    {
        if (! $value) {
            return '未設定';
        }

        return self::options()[$value] ?? $value;
    }
}
