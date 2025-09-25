<?php
declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use think\Request;
use think\Response;

class StaticController extends BaseController
{
    /**
     * 处理静态资源请求
     * @param Request $request
     * @param string $path 静态文件路径
     * @return Response
     */
    public function serve(Request $request, string $path = ''): Response
    {
        // 获取完整的文件路径
        $fullPath = $this->getFullPath($path);

        // 安全检查：防止目录遍历攻击
        if (! $this->isPathSafe($fullPath)) {
            return response('Forbidden', 403);
        }

        // 检查文件是否存在
        if (! is_file($fullPath)) {
            return response('File not found', 404);
        }

        // 获取文件信息
        $fileInfo = pathinfo($fullPath);
        $mimeType = $this->getMimeType($fileInfo['extension'] ?? '');

        // 设置缓存头
        $lastModified = filemtime($fullPath);
        $etag = md5_file($fullPath);

        // 检查客户端缓存
        $ifModifiedSince = $request->header('If-Modified-Since');
        $ifNoneMatch = $request->header('If-None-Match');

        if ($ifModifiedSince && strtotime($ifModifiedSince) >= $lastModified) {
            return response('', 304);
        }

        if ($ifNoneMatch && $ifNoneMatch === $etag) {
            return response('', 304);
        }

        // 读取文件内容
        $content = file_get_contents($fullPath);

        // 创建响应
        $response = response($content)
            ->header([
                'Content-Type' => $mimeType,
                'Content-Length' => filesize($fullPath),
                'Last-Modified' => gmdate('D, d M Y H:i:s T', $lastModified),
                'ETag' => $etag,
                'Cache-Control' => 'public, max-age=31536000', // 1年缓存
                'Expires' => gmdate('D, d M Y H:i:s T', time() + 31536000)
            ]);

        return $response;
    }

    /**
     * 获取完整文件路径
     * @param string $path
     * @return string
     */
    private function getFullPath(string $path): string
    {
        $staticPath = $this->app->getRootPath() . 'public/static/';
        return $staticPath . ltrim($path, '/');
    }

    /**
     * 安全检查：防止目录遍历攻击
     * @param string $fullPath
     * @return bool
     */
    private function isPathSafe(string $fullPath): bool
    {
        $staticPath = realpath($this->app->getRootPath() . 'public/static/');
        $requestedPath = realpath($fullPath);

        // 如果文件不存在，realpath会返回false，我们需要检查目录
        if ($requestedPath === false) {
            $requestedPath = realpath(dirname($fullPath));
            if ($requestedPath === false) {
                return false;
            }
        }

        // 确保请求的路径在静态文件目录内
        return str_starts_with($requestedPath, $staticPath);
    }

    /**
     * 根据文件扩展名获取MIME类型
     * @param string $extension
     * @return string
     */
    private function getMimeType(string $extension): string
    {
        $mimeTypes = [
            'css' => 'text/css',
            'js' => 'application/javascript',
            'json' => 'application/json',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'webp' => 'image/webp',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'eot' => 'application/vnd.ms-fontobject',
            'pdf' => 'application/pdf',
            'txt' => 'text/plain',
            'html' => 'text/html',
            'htm' => 'text/html',
            'xml' => 'application/xml',
            'zip' => 'application/zip',
        ];

        return $mimeTypes[strtolower($extension)] ?? 'application/octet-stream';
    }
}
