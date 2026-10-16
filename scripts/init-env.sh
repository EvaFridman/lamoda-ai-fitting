#!/bin/sh
# Creates .env for docker-compose.yml from .env.example: a random database password, admin token,
# proxy secret, auth secret and S3 emulator keys, local defaults for the rest, optional values left
# empty. Never overwrites an existing .env.
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
    ADMIN_API_TOKEN= | PROXY_SECRET= | BETTER_AUTH_SECRET=) echo "${line}$(openssl rand -hex 32)" ;;
    S3_ACCESS_KEY_ID=) echo "${line}$(openssl rand -hex 10)" ;;
    S3_SECRET_ACCESS_KEY=) echo "${line}$(openssl rand -hex 20)" ;;
    *) echo "$line" ;;
  esac
done < .env.example > .env

chmod 600 .env
echo "Created .env (local development values; random passwords and keys)."
