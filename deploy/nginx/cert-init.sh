#!/bin/sh
# Runs once before nginx starts (service cert-init in infra.yml, certbot image: it has openssl).
# nginx refuses to start without the certificate files its config names, and Let's Encrypt cannot
# issue one before nginx answers the ACME challenge. So, if no certificate exists yet, a temporary
# self-signed one takes its place; deploy/scripts/init-cert.sh then replaces it with the real one.
set -eu

: "${SITE_DOMAIN:?set SITE_DOMAIN}"
dir="/etc/letsencrypt/live/$SITE_DOMAIN"

if [ -s "$dir/fullchain.pem" ] && [ -s "$dir/privkey.pem" ]; then
  echo "cert-init: certificate for $SITE_DOMAIN exists"
  exit 0
fi

mkdir -p "$dir"
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout "$dir/privkey.pem" -out "$dir/fullchain.pem" \
  -subj "/CN=$SITE_DOMAIN" \
  -addext "subjectAltName=DNS:$SITE_DOMAIN,DNS:www.$SITE_DOMAIN" 2>/dev/null
# Marks the folder as temporary, so init-cert.sh knows it may delete it.
touch "$dir/self-signed"
echo "cert-init: created a temporary self-signed certificate for $SITE_DOMAIN"
