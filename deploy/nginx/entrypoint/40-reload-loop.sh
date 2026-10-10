#!/bin/sh
# Runs inside the nginx container before nginx starts. Reloads nginx every 6 hours in the
# background, so a certificate the certbot container renews is picked up without the containers
# signalling each other (and without giving certbot the Docker socket). A reload drops no requests
# while nginx serves HTTP/1.1 only (spec 0004 E38).
set -eu

(
  while sleep 6h; do
    nginx -s reload
  done
) &
