# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1: 构建 React/Vite 前端 → public/spa
# -----------------------------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY frontend/ ./

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Composer 依赖
# -----------------------------------------------------------------------------
FROM composer:2 AS vendor

WORKDIR /app

COPY composer.json ./

RUN --mount=type=cache,target=/tmp/composer-cache \
    COMPOSER_CACHE_DIR=/tmp/composer-cache \
    composer install \
      --no-dev \
      --no-interaction \
      --no-progress \
      --prefer-dist \
      --no-scripts \
      --ignore-platform-reqs

COPY . .

RUN --mount=type=cache,target=/tmp/composer-cache \
    COMPOSER_CACHE_DIR=/tmp/composer-cache \
    composer install \
      --no-dev \
      --no-interaction \
      --no-progress \
      --optimize-autoloader \
      --ignore-platform-reqs

# -----------------------------------------------------------------------------
# Stage 3: 单容器 — Caddy + PHP-FPM
# -----------------------------------------------------------------------------
FROM php:8.4-fpm-alpine AS web

RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
      $PHPIZE_DEPS \
      libpng-dev \
      libjpeg-turbo-dev \
      freetype-dev \
      libzip-dev \
      oniguruma-dev \
      libxml2-dev; \
    apk add --no-cache \
      libpng \
      libjpeg-turbo \
      freetype \
      libzip \
      oniguruma \
      curl \
      netcat-openbsd; \
    docker-php-ext-configure gd --with-freetype --with-jpeg; \
    docker-php-ext-install -j"$(nproc)" \
      pdo_mysql \
      mbstring \
      exif \
      pcntl \
      zip \
      gd \
      bcmath; \
    mkdir -p /var/run/php; \
    chown -R www-data:www-data /var/run/php; \
    sed -i 's#;pid = run/php-fpm.pid#pid = /var/run/php/php-fpm.pid#' \
      /usr/local/etc/php-fpm.conf; \
    sed -i 's#listen = 9000#listen = 127.0.0.1:9000#' \
      /usr/local/etc/php-fpm.d/www.conf; \
    apk del .build-deps

COPY --from=caddy:2-alpine /usr/bin/caddy /usr/bin/caddy

WORKDIR /var/www/html

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/start-web.sh /usr/local/bin/start-web.sh
RUN chmod +x /usr/local/bin/start-web.sh \
    && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

COPY . .
COPY --from=vendor /app/vendor ./vendor
COPY --from=frontend /src/public/spa ./public/spa

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p runtime/cache runtime/log runtime/temp runtime/session \
    && chown -R www-data:www-data runtime \
    && chmod -R 775 runtime

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/local/bin/start-web.sh"]
