#!/bin/sh
# Runs before nginx starts (official image: /docker-entrypoint.d/).
# Builds the server block for the site's domain from site.conf.template.
#
# Domain: SITE_DOMAIN from .env; if it's empty and nginx/paid-cert/ holds
# exactly one certificate (<domain>.crt + <domain>.key), that domain is used.
# Certificate, first found: purchased (paid-cert/<domain>.crt/.key), then
# Let's Encrypt (/etc/letsencrypt/live/<domain>/), then the self-signed one.
set -e

TEMPLATE=/etc/nginx/site-templates/site.conf.template
OUT_DIR=/etc/nginx/site
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.conf

DOMAIN="$SITE_DOMAIN"
if [ -z "$DOMAIN" ]; then
  set -- /etc/nginx/paid-cert/*.crt
  if [ "$#" -eq 1 ] && [ -f "$1" ]; then
    DOMAIN="$(basename "$1" .crt)"
    echo "60-site-domain.sh: SITE_DOMAIN is not set, using $DOMAIN from nginx/paid-cert"
  fi
fi

if [ -z "$DOMAIN" ]; then
  echo "60-site-domain.sh: no SITE_DOMAIN — the site answers by IP with the self-signed certificate"
  exit 0
fi

if [ -f "/etc/nginx/paid-cert/$DOMAIN.crt" ] && [ -f "/etc/nginx/paid-cert/$DOMAIN.key" ]; then
  SITE_CERT="/etc/nginx/paid-cert/$DOMAIN.crt"
  SITE_CERT_KEY="/etc/nginx/paid-cert/$DOMAIN.key"
elif [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]; then
  SITE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  SITE_CERT_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
else
  echo "60-site-domain.sh: WARNING no certificate for $DOMAIN found, browsers will warn (self-signed)"
  SITE_CERT=/etc/nginx/ssl/self-signed.crt
  SITE_CERT_KEY=/etc/nginx/ssl/self-signed.key
fi

SITE_DOMAIN="$DOMAIN" SITE_CERT="$SITE_CERT" SITE_CERT_KEY="$SITE_CERT_KEY" \
  envsubst '${SITE_DOMAIN} ${SITE_CERT} ${SITE_CERT_KEY}' < "$TEMPLATE" > "$OUT_DIR/site.conf"
echo "60-site-domain.sh: $DOMAIN uses $SITE_CERT"
