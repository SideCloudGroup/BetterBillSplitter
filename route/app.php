<?php

declare(strict_types=1);

use app\middleware\ApiAdmin;
use app\middleware\JwtAuth;
use think\facade\Route;

Route::get('/static/<path>', 'static/serve')->pattern(['path' => '.*']);

Route::get('captcha/[:config]', '\think\captcha\CaptchaController@index');

Route::group('api', function () {
    Route::get('auth/bootstrap', 'api.Auth/bootstrap');
    Route::post('auth/login', 'api.Auth/login');
    Route::post('auth/register', 'api.Auth/register');
    Route::post('auth/refresh', 'api.Auth/refresh');
    Route::post('auth/logout', 'api.Auth/logout');
    Route::get('auth/webauthn/challenge', 'api.Auth/webauthnChallenge');
    Route::post('auth/webauthn/verify', 'api.Auth/webauthnVerify');
    Route::post('auth/mfa/totp', 'api.Auth/mfaTotp');
    Route::post('auth/mfa/fido/challenge', 'api.Auth/mfaFidoChallenge');
    Route::post('auth/mfa/fido/verify', 'api.Auth/mfaFidoVerify');

    Route::group('user', function () {
        Route::get('', 'user/index');
        Route::get('payment/party/:partyId', 'user/paymentByParty');
        Route::get('payment', 'user/payment');
        Route::get('item/add', 'user/addItem');
        Route::post('item/add', 'user/processAddItem');
        Route::get('item/party/:partyId', 'user/itemListByParty');
        Route::post('item/:id', 'user/updateItemStatus');
        Route::get('item', 'user/itemList');
        Route::post('logout', 'user/logout');
        Route::get('profile', 'user/profile');
        Route::post('profile', 'user/updateProfile');

        Route::get('webauthn_reg', 'user/webauthnRequestRegister');
        Route::post('webauthn_reg', 'user/webauthnRegisterHandler');
        Route::delete('webauthn_reg/:id', 'user/webauthnDelete');

        Route::get('totp_reg', 'user/totpRegisterRequest');
        Route::post('totp_reg', 'user/totpRegisterHandle');
        Route::delete('totp_reg', 'user/totpDelete');

        Route::get('fido_reg', 'user/fidoRegisterRequest');
        Route::post('fido_reg', 'user/fidoRegisterHandle');
        Route::delete('fido_reg/:id', 'user/fidoDelete');

        Route::get('party/create', 'party/create');
        Route::get('party/join', 'party/join');
        Route::post('party/join', 'party/joinParty');
        Route::get('party/:id/users', 'party/getMembers');
        Route::get('party/:id/info', 'party/getPartyInfo');
        Route::get('party/:id/edit', 'party/edit');
        Route::post('party/:id/update', 'party/update');
        Route::post('party/:id/leave', 'party/leave');
        Route::post('party/:id/archive', 'party/archive');
        Route::get('party/:partyId/archive/download', 'party/downloadArchiveExport');
        Route::post('party/validate-timezone', 'party/validateTimezone');
        Route::get('party/search-timezones', 'party/searchTimezones');
        Route::post('party/currency-info', 'party/getCurrencyInfo');
        Route::get('party/:partyId/bestpay/download', 'user/downloadPartyBestPay');
        Route::post('party/:partyId/bestpay/clear', 'user/clearPartyBestPay');
        Route::get('party/:partyId/bestpay', 'user/partyBestPay');
        Route::delete('party/:id', 'party/destroy');
        Route::get('party/:id', 'party/show');
        Route::get('party', 'party/index');
        Route::post('party', 'party/store');
    })->middleware(JwtAuth::class);

    Route::group('admin', function () {
        Route::get('', 'admin/index');
        Route::get('user', 'admin/user');
        Route::post('user/change-password', 'admin/changePassword');
        Route::post('user/toggle-admin', 'admin/toggleAdmin');
        Route::get('party/:id/members', 'admin/partyMembers');
        Route::post('party/members', 'admin/getPartyMembers');
        Route::get('party', 'admin/party');
        Route::get('currency/add-form', 'admin/addCurrencyForm');
        Route::post('currency/add', 'admin/addCurrency');
        Route::get('currency/edit-form', 'admin/editCurrencyForm');
        Route::post('currency/edit', 'admin/editCurrency');
        Route::delete('currency/delete', 'admin/deleteCurrency');
        Route::get('currencies', 'admin/currencies');
        Route::get('setting', 'admin/settings');
        Route::post('setting', 'admin/updateSetting');
    })->middleware(JwtAuth::class)->middleware(ApiAdmin::class);
});
