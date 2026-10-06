#!/bin/sh
# Creates .env for docker-compose.yml from .env.example: a random database password, local
# defaults for the rest, optional values left empty. Never overwrites an existing .env.
set -eu
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo ".env already exists; delete it first to generate a new one" >&2
  exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    POSTGRES_USER= | POSTGRES_DB=) echo "${line}ai_fitting" ;;
    POSTGRES_PASSWORD=) echo "${line}$(openssl rand -hex 16)" ;;
    *) echo "$line" ;;
  esac
done < .env.example > .env

chmod 600 .env
echo "Created .env (local development values; random database password)."
