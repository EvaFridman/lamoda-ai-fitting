#!/bin/sh
# Runs inside the nginx container before nginx starts (the image runs /docker-entrypoint.d/* in
# order). On the very first start the upstream volume is empty: point traffic at blue, which
# deploy.sh starts first. Later starts keep whatever colour deploy.sh last switched to.
set -eu

file=/etc/nginx/upstream/active.conf
if [ ! -s "$file" ]; then
  mkdir -p "$(dirname "$file")"
  cat > "$file" <<'EOF'
upstream api { zone api 64k; server api-blue:3000 resolve; keepalive 16; }
upstream web { zone web 64k; server web-blue:3001 resolve; keepalive 16; }
EOF
  echo "05-default-upstream.sh: created $file (blue)"
fi
