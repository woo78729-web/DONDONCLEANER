# syntax=docker/dockerfile:1
# 與 Zeabur zbpack PHP 模板相同，但改從 ghcr.io 取得 install-php-extensions，
# 避免建置時 ADD github.com 連線逾時。

ARG PHP_VERSION=8.3
FROM docker.io/library/php:${PHP_VERSION}-fpm

ENV APP_ENV=${APP_ENV:-prod}
ENV APP_DEBUG=${APP_DEBUG:-true}

WORKDIR /var/www

COPY --from=ghcr.io/mlocati/php-extension-installer:latest /usr/bin/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions && sync

ARG APT_EXTRA_DEPENDENCIES=""
RUN set -eux \
	&& apt update \
	&& apt install -y cron curl gettext git grep libicu-dev nginx pkg-config unzip ${APT_EXTRA_DEPENDENCIES} \
	&& rm -rf /var/www/html \
	&& curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh \
	&& bash nodesource_setup.sh \
	&& apt install -y nodejs \
	&& rm -rf /var/lib/apt/lists/*

ARG PHP_EXTENSIONS=""
RUN install-php-extensions @composer apcu bcmath gd intl mysqli opcache pcntl pdo_mysql sysvsem zip ${PHP_EXTENSIONS}

RUN cat <<'EOF' > /etc/nginx/sites-enabled/default
server {
    listen 8080;
    root /var/www;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php index.html;
    charset utf-8;

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_split_path_info ^(.+\.php)(/.*)$;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_hide_header X-Powered-By;
    }

    location / {
        try_files $uri $uri/ /index.php$is_args$args;
        gzip_static on;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }

    error_log /dev/stderr;
    access_log /dev/stderr;
}
EOF

RUN chown -R www-data:www-data /var/www
COPY --link --chown=www-data:www-data --chmod=755 . /var/www

USER www-data
RUN set -eux \
	&& if [ -f composer.json ]; then composer install --optimize-autoloader --classmap-authoritative --no-dev; fi \
	&& if [ -f package.json ]; then npm install; fi

ARG BUILD_COMMAND="npm run build"
RUN if [ -n "${BUILD_COMMAND}" ]; then ${BUILD_COMMAND}; fi

ARG PHP_OPTIMIZE="true"
RUN <<EOF
	set -ux

	if [ ! "${PHP_OPTIMIZE}" = "true" ]; then
		echo "ZBPACK_PHP_OPTIMIZE is not set to true, skipping optimization"
		echo "You will need to run cache, optimization, and some build command manually."
		exit 0
	fi

	if [ -x artisan ]; then
		php artisan optimize
		php artisan config:cache
		php artisan event:cache
		php artisan route:cache
		php artisan view:cache
	fi

	if [ -x bin/console ]; then
		composer dump-env prod
		composer run-script --no-dev post-install-cmd
		php bin/console cache:clear
		php bin/console asset-map:compile
	fi

	if [ -x ./node_modules/.bin/encore ]; then
		./node_modules/.bin/encore production
	fi

	if grep -q '"build":' package.json; then
		npm run build
	fi
EOF

USER root

RUN if [ -d /var/www/public ]; then sed -i 's|root /var/www;|root /var/www/public;|' /etc/nginx/sites-enabled/default; fi

ARG START_COMMAND="_startup() { nginx; php-fpm; }; php artisan migrate --force && php artisan storage:link --force && _startup"
ENV START_COMMAND=${START_COMMAND}
CMD eval ${START_COMMAND}

EXPOSE 8080
