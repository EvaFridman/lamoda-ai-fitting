#!/usr/bin/env bash
# Issues the site's Let's Encrypt certificate once, replacing the temporary self-signed one that
# cert-init creates (deploy/nginx/cert-init.sh). After this the certbot container renews it and
# nginx picks the renewal up on its 6-hour reload. Run on the server, from /opt/ai-fitting:
#
#   deploy/scripts/init-cert.sh --staging <email>   # Let's Encrypt's test server: debug here first
#   deploy/scripts/init-cert.sh <email>             # the real certificate
#
# <email> receives Let's Encrypt's notices (e.g. a renewal that keeps failing). Production limits are
# strict (5 identical certificates a week), so use --staging until the staging run succeeds.
set -euo pipefail

staging=()
if [ "${1:-}" = --staging ]; then
  staging=(--staging)
  shift
fi
email="${1:?usage: init-cert.sh [--staging] <email>}"

root="$(cd "$(dirname "$0")/../.." && pwd)"
env_file="$root/.env"
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
: "${SITE_DOMAIN:?set SITE_DOMAIN in $env_file}"

log() { printf 'init-cert: %s\n' "$*" >&2; }
infra() { docker compose -f "$root/deploy/compose/infra.yml" --env-file "$env_file" --profile server "$@"; }
certbot() { infra run --rm --no-deps --entrypoint certbot certbot "$@"; }
# Runs in the certbot image (it has openssl): prints "self-signed", "staging", "real" or "none".
current_certificate() {
  infra run --rm --no-deps --entrypoint sh certbot -c "
    dir=/etc/letsencrypt/live/$SITE_DOMAIN
    if [ -e \$dir/self-signed ]; then echo self-signed
    elif [ ! -s \$dir/fullchain.pem ]; then echo none
    elif openssl x509 -in \$dir/fullchain.pem -noout -issuer | grep -q STAGING; then echo staging
    else echo real; fi
  " 2>/dev/null | tail -1
}

current="$(current_certificate)"
log "current certificate for $SITE_DOMAIN: $current"
case "$current" in
  real)
    log "a real certificate is already in place; the certbot container renews it"
    exit 0
    ;;
  staging)
    # A test certificate cannot be renewed into a real one: remove it first.
    certbot delete --cert-name "$SITE_DOMAIN" --non-interactive
    ;;
  self-signed)
    # certbot refuses to write into a live/ folder it did not create.
    infra run --rm --no-deps --entrypoint sh certbot -c \
      "rm -rf /etc/letsencrypt/live/$SITE_DOMAIN /etc/letsencrypt/archive/$SITE_DOMAIN \
         /etc/letsencrypt/renewal/$SITE_DOMAIN.conf"
    ;;
esac

log "requesting a ${staging:+staging }certificate for $SITE_DOMAIN and www.$SITE_DOMAIN"
if ! certbot certonly ${staging[@]+"${staging[@]}"} --webroot -w /var/www/certbot \
  --cert-name "$SITE_DOMAIN" -d "$SITE_DOMAIN" -d "www.$SITE_DOMAIN" \
  --email "$email" --agree-tos --no-eff-email --non-interactive; then
  log "FAILED; putting the temporary self-signed certificate back so nginx keeps working"
  infra up --no-deps cert-init >&2
  exit 1
fi

infra exec -T nginx sh -c 'nginx -t -q && nginx -s reload'
log "done: nginx serves the new certificate ($(current_certificate))"
