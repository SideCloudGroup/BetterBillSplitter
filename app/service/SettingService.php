<?php

declare (strict_types=1);

namespace app\service;

use app\model\Setting;
use think\Service;

class SettingService extends Service
{
    public function register(): void
    {
        $this->app->bind('settingService', SettingService::class);
    }

    public function getSetting($key, $default = null): mixed
    {
        $settings = cache('settings');
        if ($settings !== null && array_key_exists($key, $settings)) {
            return $settings[$key];
        }

        $setting = (new Setting())->where('key', $key)->findOrEmpty();
        if ($setting->isEmpty()) {
            return $default;
        } else {
            $settings[$key] = $setting->value;
            cache('settings', $settings);
            return $setting->value;
        }
    }

    public function getAllSettings(): array
    {
        return [
            'general' => [
                'name' => [
                    'type' => 'text',
                    'name' => "网站名称",
                    'key' => 'general_name',
                    'description' => "显示在登录、注册等页面的站点标题",
                ],
                'enableRegister' => [
                    'type' => 'switch',
                    'name' => "注册功能",
                    'key' => 'general_enableRegister',
                    'description' => "是否允许用户注册",
                ],
            ],
            'captcha' => [
                'driver' => [
                    'type' => 'select',
                    'name' => "验证码驱动",
                    'key' => 'captcha_driver',
                    'description' => "选择使用的验证码服务",
                    'options' => [
                        'none' => "禁用验证码",
                        'numeric' => '数字验证码',
                        'turnstile' => 'Cloudflare Turnstile',
                        'hcaptcha' => 'hCaptcha',
                        'cap' => 'Cap',
                    ],
                ],
                'customUrl' => [
                    'type' => 'text',
                    'name' => '自定义URL',
                    'key' => 'captcha_customUrl',
                    'description' => "仅适用于 Cap",
                ],
                'siteKey' => [
                    'type' => 'text',
                    'name' => 'Site Key',
                    'key' => 'captcha_siteKey',
                    'description' => "Turnstile、hCaptcha、Cap 的公钥（前端可见）",
                ],
                'secretKey' => [
                    'type' => 'text',
                    'name' => 'Secret Key',
                    'key' => 'captcha_siteSecret',
                    'description' => "对应服务的私钥，仅服务端校验时使用，请勿泄露",
                ],
            ],
        ];
    }

    public function updateSetting(string $key, string $value): void
    {
        $setting = (new Setting())->where('key', $key)->findOrEmpty();
        match ($value) {
            'on' => $value = '1',
            'off' => $value = '0',
            default => $value,
        };
        if ($setting->isEmpty()) {
            $setting = new Setting();
            $setting->key = $key;
        }
        $setting->value = $value;
        $setting->save();

        // 更新缓存
        $settings = cache('settings') ?? [];
        $settings[$key] = $value;
        cache('settings', $settings);
    }
}
