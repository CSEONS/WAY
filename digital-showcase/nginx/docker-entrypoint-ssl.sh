#!/bin/sh
# Runs automatically as part of the official nginx image's entrypoint
# (anything executable in /docker-entrypoint.d/ is run before nginx starts).
#
# Part 1 generates a self-signed TLS certificate so the site is reachable
# over https:// even without a real domain (unblocks browser features that
# require a "secure context", e.g. the EyeDropper API used by the color
# picker, when the site is opened by bare IP).
#
# Part 2, when LE_DOMAIN is set, seeds a throwaway dummy certificate at the
# path Let's Encrypt will use, so nginx can start even before certbot has
# run for the first time. Once `certbot certonly` succeeds, the real
# certificate overwrites the dummy on the shared volume and nginx just
# needs a reload/restart to pick it up.
set -e

# --- Part 1: self-signed cert for direct-IP / no-domain access ---
CERT_DIR=/etc/nginx/ssl
CERT_FILE="$CERT_DIR/self-signed.crt"
KEY_FILE="$CERT_DIR/self-signed.key"
CN_FILE="$CERT_DIR/self-signed.cn"
CN="${SSL_DOMAIN:-localhost}"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ] && [ -f "$CN_FILE" ] && [ "$(cat "$CN_FILE")" = "$CN" ]; then
  echo "50-generate-self-signed-cert.sh: existing self-signed certificate for $CN found, skipping generation"
else
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
fi

# --- Part 2: dummy cert for the Let's Encrypt domain (see header comment) ---
if [ -n "$LE_DOMAIN" ]; then
  LE_DIR="/etc/letsencrypt/live/$LE_DOMAIN"
  if [ -f "$LE_DIR/fullchain.pem" ] && [ -f "$LE_DIR/privkey.pem" ]; then
    echo "50-generate-self-signed-cert.sh: certificate for $LE_DOMAIN already present, skipping dummy cert"
  else
    echo "50-generate-self-signed-cert.sh: no Let's Encrypt cert yet for $LE_DOMAIN, seeding temporary dummy cert"
    mkdir -p "$LE_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "$LE_DIR/privkey.pem" \
      -out "$LE_DIR/fullchain.pem" \
      -subj "/CN=$LE_DOMAIN"
  fi
fi
