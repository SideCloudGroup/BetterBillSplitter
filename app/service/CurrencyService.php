<?php

declare (strict_types=1);

namespace app\service;

use app\model\Currency;
use Exception;
use GuzzleHttp\Client;
use think\facade\Cache;
use think\Service;

class CurrencyService extends Service
{
    private string $apiUrl = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{type}.json";

    public function register(): void
    {
        $this->app->bind('currencyService', CurrencyService::class);
    }


    /**
     * 获取派对特定的汇率
     */
    public function getPartyExchangeRate(string $baseCurrency, array $supportedCurrencies = []): array
    {
        $cacheKey = "party_exchange_rate_{$baseCurrency}_" . md5(serialize($supportedCurrencies));
        $exchangeRate = Cache::get($cacheKey);

        if ($exchangeRate === null) {
            $exchangeRate = $this->fetchPartyExchangeRateFromCache($baseCurrency, $supportedCurrencies);
            Cache::set($cacheKey, $exchangeRate, 3600);
        }

        return $exchangeRate;
    }

    /**
     * 从缓存获取派对特定汇率，如果缓存中没有则从API获取
     */
    private function fetchPartyExchangeRateFromCache(string $baseCurrency, array $supportedCurrencies = []): array
    {
        $exchangeRate = [];
        $exchangeRate[$baseCurrency] = 1;

        if (empty($supportedCurrencies)) {
            return $exchangeRate;
        }

        // 尝试从全局汇率缓存中获取
        $globalRates = $this->getGlobalExchangeRates($baseCurrency);

        foreach ($supportedCurrencies as $currency) {
            if ($currency == $baseCurrency) {
                continue;
            }

            if (isset($globalRates[$currency])) {
                $exchangeRate[$currency] = $globalRates[$currency];
            } else {
                // 如果全局缓存中没有，尝试单独获取该货币的汇率
                $singleRate = $this->getSingleCurrencyRate($baseCurrency, $currency);
                if ($singleRate !== null) {
                    $exchangeRate[$currency] = $singleRate;
                }
            }
        }

        return $exchangeRate;
    }

    /**
     * 获取全局汇率缓存
     */
    private function getGlobalExchangeRates(string $baseCurrency): array
    {
        $cacheKey = "global_exchange_rates_{$baseCurrency}";
        $rates = Cache::get($cacheKey);

        if ($rates === null) {
            // 如果缓存中没有，从API获取并缓存
            $rates = $this->fetchAndCacheGlobalRates($baseCurrency);
        }

        return $rates;
    }

    /**
     * 从API获取并缓存全局汇率
     */
    private function fetchAndCacheGlobalRates(string $baseCurrency): array
    {
        try {
            $client = new Client();
            $res = $client->request('GET', str_replace('{type}', $baseCurrency, $this->apiUrl), [
                'timeout' => 15,
                'headers' => [
                    'Accept' => 'application/json',
                ],
            ]);

            if ($res->getStatusCode() != "200") {
                throw new Exception("Failed to fetch exchange rate");
            }

            $data = json_decode((string)$res->getBody(), true);
            if (! isset($data[$baseCurrency])) {
                throw new Exception("Invalid exchange rate data. " . $baseCurrency . " not found");
            }

            $rates = [];
            foreach ($data[$baseCurrency] as $currency => $rate) {
                $rates[$currency] = round($rate, 4);
            }

            // 缓存全局汇率，有效期1小时
            $cacheKey = "global_exchange_rates_{$baseCurrency}";
            Cache::set($cacheKey, $rates, 3600);

            return $rates;
        } catch (Exception $e) {
            error_log('Failed to fetch global exchange rates: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * 获取单个货币的汇率
     */
    private function getSingleCurrencyRate(string $baseCurrency, string $targetCurrency): ?float
    {
        $cacheKey = "single_rate_{$baseCurrency}_{$targetCurrency}";
        $rate = Cache::get($cacheKey);

        if ($rate === null) {
            // 如果缓存中没有，从API获取并缓存
            $rate = $this->fetchAndCacheSingleRate($baseCurrency, $targetCurrency);
        }

        return $rate;
    }

    /**
     * 从API获取并缓存单个货币汇率
     */
    private function fetchAndCacheSingleRate(string $baseCurrency, string $targetCurrency): ?float
    {
        try {
            $client = new Client();
            $res = $client->request('GET', str_replace('{type}', $baseCurrency, $this->apiUrl), [
                'timeout' => 15,
                'headers' => [
                    'Accept' => 'application/json',
                ],
            ]);

            if ($res->getStatusCode() != "200") {
                throw new Exception("Failed to fetch exchange rate");
            }

            $data = json_decode((string)$res->getBody(), true);
            if (! isset($data[$baseCurrency][$targetCurrency])) {
                return null;
            }

            $rate = round($data[$baseCurrency][$targetCurrency], 4);

            // 缓存单个汇率，有效期1小时
            $cacheKey = "single_rate_{$baseCurrency}_{$targetCurrency}";
            Cache::set($cacheKey, $rate, 3600);

            return $rate;
        } catch (Exception $e) {
            error_log('Failed to fetch single exchange rate: ' . $e->getMessage());
            return null;
        }
    }


    /**
     * 验证货币代码是否有效
     */
    public function isValidCurrency(string $currencyCode): bool
    {
        try {
            return Currency::codeExists($currencyCode);
        } catch (Exception $e) {
            error_log('Failed to validate currency: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * 获取货币信息
     */
    public function getCurrencyInfo(string $currencyCode): ?array
    {
        try {
            $currency = Currency::getByCode($currencyCode);
            if (! $currency) {
                return null;
            }

            return [
                'id' => $currency->id,
                'name' => $currency->name,
                'name_en' => $currency->name_en,
                'symbol' => $currency->symbol,
                'code' => strtoupper($currency->code),
                'decimal_places' => $currency->decimal_places,
                'is_default' => $currency->is_default,
                'is_active' => $currency->is_active
            ];
        } catch (Exception $e) {
            error_log('Failed to get currency info: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * 获取货币名称（支持多语言）
     */
    public function getCurrencyName(string $currencyCode, string $language = 'zh'): string
    {
        try {
            $currency = Currency::getByCode($currencyCode);
            if (! $currency) {
                return strtoupper($currencyCode);
            }

            if ($language === 'en' && ! empty($currency->name_en)) {
                return $currency->name_en;
            }

            return $currency->name;
        } catch (Exception $e) {
            error_log('Failed to get currency name: ' . $e->getMessage());
            return strtoupper($currencyCode);
        }
    }

    /**
     * 获取货币显示名称
     */
    public function getCurrencyDisplayName(string $currencyCode): string
    {
        $currencies = $this->getAllAvailableCurrencies();
        return $currencies[$currencyCode]['name'] ?? strtoupper($currencyCode);
    }

    /**
     * 获取所有可用货币列表
     */
    public function getAllAvailableCurrencies(): array
    {
        try {
            $currencies = Currency::getActiveCurrencies();
            $result = [];

            foreach ($currencies as $currency) {
                $result[$currency->code] = [
                    'id' => $currency->id,
                    'name' => $currency->name,
                    'name_en' => $currency->name_en,
                    'symbol' => $currency->symbol,
                    'code' => strtoupper($currency->code),
                    'decimal_places' => $currency->decimal_places,
                    'is_default' => $currency->is_default,
                    'is_active' => $currency->is_active
                ];
            }

            return $result;
        } catch (Exception $e) {
            // 如果数据库读取失败，返回默认货币列表
            error_log('Failed to load currencies from database: ' . $e->getMessage());
            return $this->getDefaultCurrencies();
        }
    }

    /**
     * 获取默认货币列表（作为备用）
     */
    private function getDefaultCurrencies(): array
    {
        return [
            'cny' => [
                'id' => 1,
                'name' => '人民币',
                'name_en' => 'Chinese Yuan',
                'symbol' => '¥',
                'code' => 'CNY',
                'decimal_places' => 2,
                'is_default' => true,
                'is_active' => true
            ]
        ];
    }

    /**
     * 获取货币符号
     */
    public function getCurrencySymbol(string $currencyCode): string
    {
        $currencies = $this->getAllAvailableCurrencies();
        return $currencies[$currencyCode]['symbol'] ?? strtoupper($currencyCode);
    }
}
