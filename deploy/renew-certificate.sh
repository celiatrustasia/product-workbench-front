#!/bin/sh
set -eu

/usr/bin/docker run --rm --name product-workbench-cert-renew \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/log/letsencrypt:/var/log/letsencrypt \
    -v /var/www/product-workbench-acme:/var/www/product-workbench-acme \
    certbot/certbot:v5.8.0 renew \
    --cert-name dylandw.site \
    --webroot --webroot-path /var/www/product-workbench-acme \
    --non-interactive

/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
