<?php

declare(strict_types=1);

namespace app\support;

use think\Response;

final class ApiJson
{
    public static function ok(array $data = [], int $code = 200): Response
    {
        return json(array_merge(['ok' => true], $data), $code);
    }

    public static function err(string $message, int $httpCode = 400, array $extra = []): Response
    {
        return json(array_merge([
            'ok' => false,
            'error' => $message,
        ], $extra), $httpCode);
    }

    /**
     * 兼容旧版 ret/msg 形态（业务层可逐步迁移到 ok/error）
     */
    public static function legacy(int $ret, string $msg, array $extra = []): Response
    {
        return json(array_merge(['ret' => $ret, 'msg' => $msg], $extra), $ret === 1 ? 200 : 422);
    }
}
