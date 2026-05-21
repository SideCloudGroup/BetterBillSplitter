#!/bin/sh
set -e

cd /var/www/html || exit 1

# runtime 在 .dockerignore 中，需在容器内创建可写目录
mkdir -p runtime/cache runtime/log runtime/temp runtime/session

chown -R www-data:www-data /var/www/html
find /var/www/html/runtime -type d -exec chmod 775 {} \;
find /var/www/html/runtime -type f -exec chmod 664 {} \; 2>/dev/null || true

# 以 www-data 执行迁移，避免 runtime 下生成 root 属主文件
su -s /bin/sh www-data -c "php think migrate:run"

exec "$@"
