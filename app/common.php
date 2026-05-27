<?php
// 应用公共文件

function getSetting(string $key, $default = null)
{
    return app()->settingService->getSetting($key, $default);
}
