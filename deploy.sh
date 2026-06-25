#!/usr/bin/env bash
set -euo pipefail

DOMAIN="legal.supaplay.fun"
TARGET="/var/www/${DOMAIN}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this script with sudo: sudo ./deploy.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$TARGET"
rsync -a --delete --exclude='.git' "$SCRIPT_DIR/" "$TARGET/"
chown -R www-data:www-data "$TARGET"

if [[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]]; then
  cp "$TARGET/nginx-legal-supaplay.conf" "$NGINX_AVAILABLE"
else
  cat > "$NGINX_AVAILABLE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    root ${TARGET}/public;
    index index.html;

    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
fi

ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "SupaPlay files deployed for ${DOMAIN}."
echo "Make sure the smart API is running on 127.0.0.1:4000."
if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "Now run: sudo certbot --nginx -d ${DOMAIN}"
fi
