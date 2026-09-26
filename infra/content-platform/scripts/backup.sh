#!/usr/bin/env bash
# Safe PostgreSQL logical-backup template. It prints the command unless --execute is given.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
platform_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="${ENV_FILE:-$platform_dir/.env}"
compose_file="$platform_dir/docker-compose.yml"

if [[ ! -f "$env_file" ]]; then
  echo "Missing deployment environment file: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

backup_dir="${CONTENT_ROOT:?CONTENT_ROOT is required}/backups/postgres"
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
target="$backup_dir/${POSTGRES_DB:?POSTGRES_DB is required}-$stamp.sql.gz"
command=(docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' )

echo "Backup target: $target"
echo "Source: PostgreSQL service in $compose_file"
if [[ "${1:-}" != "--execute" ]]; then
  echo "Dry run only. No directory or backup is created. Run with --execute to create this backup."
  exit 0
fi

mkdir -p "$backup_dir"
if [[ -e "$target" ]]; then
  echo "Refusing to overwrite existing backup: $target" >&2
  exit 1
fi

temporary="$(mktemp "$backup_dir/.${POSTGRES_DB}-$stamp.XXXXXX")"
cleanup() {
  if [[ -n "${temporary:-}" && -e "$temporary" ]]; then
    rm -f -- "$temporary"
  fi
}
trap cleanup EXIT INT TERM

"${command[@]}" | gzip -c > "$temporary"
test -s "$temporary"
gzip -t "$temporary"
mv "$temporary" "$target"
temporary=""
echo "Created $target"
