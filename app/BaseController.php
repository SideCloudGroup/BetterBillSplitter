<?php

declare (strict_types=1);

namespace app;

use think\App;
use think\exception\HttpException;

/**
 * 控制器基础类
 */
abstract class BaseController
{
    /**
     * Request实例
     * @var \think\Request
     */
    protected $request;

    /**
     * 应用实例
     * @var App
     */
    protected $app;

    /**
     * 控制器中间件
     * @var array
     */
    protected $middleware = [];

    /**
     * 构造方法
     * @access public
     * @param App $app 应用对象
     */
    public function __construct(App $app)
    {
        $this->app = $app;
        $this->request = $this->app->request;

        // 控制器初始化
        $this->initialize();
    }

    // 初始化
    protected function initialize()
    {
    }

    /**
     * @throws HttpException
     */
    protected function currentUserId(): int
    {
        $user = app('userService')->getUser();
        if ($user === null) {
            throw new HttpException(401, '未登录');
        }

        return $user->id;
    }

}
