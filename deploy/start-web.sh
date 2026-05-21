#!/bin/sh
set -e

php-fpm -D

i=0
while [ "$i" -lt 30 ]; do
	if nc -z 127.0.0.1 9000 2>/dev/null; then
		break
	fi
	i=$((i + 1))
	sleep 0.2
done

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
