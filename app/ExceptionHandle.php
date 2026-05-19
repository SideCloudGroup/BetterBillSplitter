<?php

namespace app;

use think\db\exception\DataNotFoundException;
use think\db\exception\ModelNotFoundException;
use think\exception\Handle;
use think\exception\HttpException;
use think\exception\HttpResponseException;
use think\exception\ValidateException;
use think\Response;
use Throwable;

use function is_string;

/**
 * 应用异常处理类
 */
class ExceptionHandle extends Handle
{
    /**
     * 不需要记录信息（日志）的异常类列表
     * @var array
     */
    protected $ignoreReport = [
        HttpException::class,
        HttpResponseException::class,
        ModelNotFoundException::class,
        DataNotFoundException::class,
        ValidateException::class,
    ];

    /**
     * 记录异常信息（包括日志或者其它方式记录）
     *
     * @access public
     * @param Throwable $exception
     * @return void
     */
    public function report(Throwable $exception): void
    {
        // 使用内置的方式记录异常日志
        parent::report($exception);
    }

    /**
     * Render an exception into an HTTP response.
     *
     * @access public
     * @param \think\Request $request
     * @param Throwable $e
     * @return Response
     */
    public function render($request, Throwable $e): Response
    {
        if ($e instanceof HttpResponseException) {
            return $e->getResponse();
        }

        $pathinfo = $request->pathinfo();
        if (! is_string($pathinfo) || ! str_starts_with($pathinfo, 'api/')) {
            return parent::render($request, $e);
        }

        if ($e instanceof ValidateException) {
            return json(['ret' => 0, 'msg' => $e->getMessage()], 422);
        }

        if ($e instanceof HttpException) {
            $code = $e->getStatusCode();
            $msg = $e->getMessage() ? : match ($code) {
                400 => '请求无效',
                401 => '未授权',
                403 => '禁止访问',
                404 => '未找到',
                405 => '方法不允许',
                default => '请求错误',
            };

            return json(['ret' => 0, 'msg' => $msg], $code);
        }

        $msg = '服务器错误';
        if ($this->app->isDebug()) {
            $msg = $e->getMessage();
        }

        return json(['ret' => 0, 'msg' => $msg], 500);
    }
}
