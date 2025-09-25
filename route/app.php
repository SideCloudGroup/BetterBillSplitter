<?php
// +----------------------------------------------------------------------
// | ThinkPHP [ WE CAN DO IT JUST THINK ]
// +----------------------------------------------------------------------
// | Copyright (c) 2006~2018 http://thinkphp.cn All rights reserved.
// +----------------------------------------------------------------------
// | noded ( http://www.apache.org/nodes/node-2.0 )
// +----------------------------------------------------------------------
// | Author: liu21st <liu21st@gmail.com>
// +----------------------------------------------------------------------
use app\middleware\Admin;
use app\middleware\Auth;
use app\middleware\User;
use think\facade\Route;


Route::group('auth', function () {
    Route::get('/login', 'auth/loginPage');
    Route::post('/login', 'auth/login');
    Route::get('/register', 'auth/registerPage');
    Route::post('/register', 'auth/register');
    Route::get('/webauthn_request', 'auth/webauthnRequest');
    Route::post('/webauthn_verify', 'auth/webauthnHandler');
    Route::get('/2fa', 'auth/MfaPage');
    Route::post('/totp_verify', 'auth/mfaTotpHandler');
    Route::get('/fido_request', 'auth/mfaFidoRequest');
    Route::post('/fido_verify', 'auth/mfaFidoAssert');
})->middleware(Auth::class);

Route::rule('/', 'user/index')->middleware(User::class);
Route::group('/user', function () {
    Route::get('', 'user/index');
    Route::get('/', 'user/index');

    Route::get('/payment/party/:partyId', 'user/paymentByParty');
    Route::get('/payment', 'user/payment');
    Route::get('/item/add', 'user/addItem');
    Route::post('/item/add', 'user/processAddItem');
    Route::get('/item/party/:partyId', 'user/itemListByParty');
    Route::post('/item/:id', 'user/updateItemStatus');
    Route::get('/item', 'user/itemList');
    Route::get('/logout', 'user/logout');
    Route::get('/profile', 'user/profile');
    Route::post('/profile', 'user/updateProfile');
    // WebAuthn
    Route::get('/webauthn_reg', 'user/webauthnRequestRegister');
    Route::post('/webauthn_reg', 'user/webauthnRegisterHandler');
    Route::delete('/webauthn_reg/:id', 'user/webauthnDelete');
    //
    // TOTP
    Route::get('/totp_reg', 'user/totpRegisterRequest');
    Route::post('/totp_reg', 'user/totpRegisterHandle');
    Route::delete('/totp_reg', 'user/totpDelete');
    //
    // FIDO
    Route::get('/fido_reg', 'user/fidoRegisterRequest');
    Route::post('/fido_reg', 'user/fidoRegisterHandle');
    Route::delete('/fido_reg/:id', 'user/fidoDelete');
    //
    // Party
    Route::get('/party/create', 'party/create');
    Route::get('/party/join', 'party/join');
    Route::post('/party/join', 'party/joinParty');
    Route::get('/party/:id/users', 'party/getMembers');
    Route::get('/party/:id/info', 'party/getPartyInfo');
    Route::get('/party/:id/edit', 'party/edit');
    Route::post('/party/:id/update', 'party/update');
    Route::post('/party/:id/leave', 'party/leave');
    Route::post('/party/validate-timezone', 'party/validateTimezone');
    Route::get('/party/search-timezones', 'party/searchTimezones');
    Route::post('/party/currency-info', 'party/getCurrencyInfo');
    Route::get('/party/:partyId/bestpay/download', 'user/downloadPartyBestPay');
    Route::post('/party/:partyId/bestpay/clear', 'user/clearPartyBestPay');
    Route::get('/party/:partyId/bestpay', 'user/partyBestPay');
    Route::delete('/party/:id', 'party/destroy');
    Route::get('/party/:id', 'party/show');
    Route::get('/party', 'party/index');
    Route::post('/party', 'party/store');
})->middleware(User::class);

Route::group('/admin', function () {
    Route::get('', 'admin/index');
    Route::get('/', 'admin/index');
    Route::get('/user', 'admin/user');
    Route::post('/user/change-password', 'admin/changePassword');
    Route::post('/user/toggle-admin', 'admin/toggleAdmin');
    Route::get('/party/:id/members', 'admin/partyMembers');
    Route::post('/party/members', 'admin/getPartyMembers');
    Route::get('/party', 'admin/party');
    Route::get('/currency/add-form', 'admin/addCurrencyForm');
    Route::post('/currency/add', 'admin/addCurrency');
    Route::get('/currency/edit-form', 'admin/editCurrencyForm');
    Route::post('/currency/edit', 'admin/editCurrency');
    Route::delete('/currency/delete', 'admin/deleteCurrency');
    Route::get('/currencies', 'admin/currencies');
    Route::get('setting', 'admin/settings');
    Route::post('setting', 'admin/updateSetting');
})->middleware(Admin::class);

// 静态资源路由 - 处理 /static/ 路径下的所有文件
Route::get('/static/<path>', 'static/serve')->pattern(['path' => '.*']);