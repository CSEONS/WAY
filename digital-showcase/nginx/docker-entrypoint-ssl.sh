#!/bin/sh
# Runs automatically as part of the official nginx image's entrypoint
# (anything executable in /docker-entrypoint.d/ is run before nginx starts).
#
# Generates a self-signed TLS certificate so the site is reachable over
# https:// even without a real domain. This unblocks browser features that
# require a "secure context" (e.g. the EyeDropper API used by the color
# picker) when the site is opened by bare IP.
#
# This is a stopgap. Once a real domain points at this server, switch to a
# CA-trusted certificate (e.g. certbot/Let's Encrypt) instead — self-signed
# certs make every browser show a security warning on first visit.
set -e

CERT_DIR=/etc/nginx/ssl
CERT_FILE="$CERT_DIR/self-signed.crt"
KEY_FILE="$CERT_DIR/self-signed.key"
CN_FILE="$CERT_DIR/self-signed.cn"
CN="${SSL_DOMAIN:-localhost}"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ] && [ -f "$CN_FILE" ] && [ "$(cat "$CN_FILE")" = "$CN" ]; then
  echo "50-generate-self-signed-cert.sh: existing certificate for $CN found, skipping generation"
  exit 0
fi

# Pick the right SAN type: an IP address needs "IP:", a hostname needs "DNS:".
SAN="DNS:$CN"
case "$CN" in
  ''|*[!0-9.]*) SAN="DNS:$CN" ;;
  *) SAN="IP:$CN" ;;
esac

echo "50-generate-self-signed-cert.sh: generating self-signed certificate for $CN ($SAN)"
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -subj "/CN=$CN" \
  -addext "subjectAltName=$SAN"

echo "$CN" > "$CN_FILE"
