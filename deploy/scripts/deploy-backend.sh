#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

usage() {
  echo "Usage: $0 [--dry-run] YYYYMMDDTHHMMSSZ-GIT_SHA" >&2
}

dry_run=0
if [[ ${1:-} == "--dry-run" ]]; then
  dry_run=1
  shift
fi
if [[ $# -ne 1 ]]; then
  usage
  exit 64
fi

release_id=$1
if [[ ! $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}$ ]]; then
  echo "Invalid release ID: $release_id" >&2
  exit 64
fi

script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repository_root=$(cd -- "$script_root/../.." && pwd -P)
backend_root="$repository_root/backend"
source_binary="$backend_root/target/release/social-media-backend"
live_binary="$backend_root/social-media-backend"
environment_file="$backend_root/.env"
migrations_root="$backend_root/migrations"
candidate_root=/var/lib/media/backend-candidates
candidate_binary="$candidate_root/social-media-backend-$release_id"
backup_binary="/var/backups/media-binary-pre-backend-$release_id"
live_next="$backend_root/social-media-backend.next-$release_id"
live_rollback="$backend_root/social-media-backend.rollback-$release_id"
database_name=${MEDIA_DATABASE_NAME:-social_media}
canary_port=18084
canary_unit="media-backend-canary-$release_id.service"
origin=https://media.micutu.com
resolve_origin=media.micutu.com:443:127.0.0.1

if [[ ! $database_name =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Invalid database name" >&2
  exit 64
fi
for binary in "$source_binary" "$live_binary"; do
  if [[ ! -f $binary || -L $binary || ! -x $binary ]]; then
    echo "Missing or unsafe executable: $binary" >&2
    exit 66
  fi
  if ! file --brief -- "$binary" | grep -Eq '^ELF .* executable'; then
    echo "Backend artifact is not an ELF executable: $binary" >&2
    exit 66
  fi
done
for destination in "$candidate_binary" "$backup_binary" "$live_next" "$live_rollback"; do
  if [[ -e $destination || -L $destination ]]; then
    echo "Release destination already exists: $destination" >&2
    exit 73
  fi
done

source_versions=()
while IFS= read -r migration_name; do
  if [[ ! $migration_name =~ ^([0-9]{14})_.+\.sql$ ]]; then
    echo "Invalid migration filename: $migration_name" >&2
    exit 65
  fi
  source_versions+=("${BASH_REMATCH[1]}")
done < <(find "$migrations_root" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
if [[ ${#source_versions[@]} -eq 0 ]]; then
  echo "No backend migrations found" >&2
  exit 65
fi

source_hash=$(sha256sum -- "$source_binary" | awk '{print $1}')
live_hash=$(sha256sum -- "$live_binary" | awk '{print $1}')
latest_source_migration=${source_versions[${#source_versions[@]}-1]}

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "source=$source_binary"
  echo "source_sha256=$source_hash"
  echo "live_sha256=$live_hash"
  echo "candidate=$candidate_binary"
  echo "backup=$backup_binary"
  echo "migrations=${#source_versions[@]}"
  echo "latest_migration=$latest_source_migration"
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Production activation requires root; rerun with sudo" >&2
  exit 77
fi
for command in curl file find grep install journalctl mariadb sha256sum ss systemctl systemd-run; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ ! -f $environment_file || -L $environment_file ]]; then
  echo "Missing or unsafe environment file: $environment_file" >&2
  exit 66
fi
if [[ $(stat -c '%U:%G:%a' "$environment_file") != "root:root:600" ]]; then
  echo "Environment file must be root:root mode 600" >&2
  exit 77
fi
for service in social-media.service nginx.service cloudflared.service; do
  if ! systemctl is-active --quiet "$service"; then
    echo "Required service is not active: $service" >&2
    exit 69
  fi
done
if ss -ltnH "( sport = :$canary_port )" | grep -q .; then
  echo "Canary port is already in use: $canary_port" >&2
  exit 69
fi

failed_migrations=$(mariadb --batch --skip-column-names "$database_name" \
  -e 'SELECT COUNT(*) FROM _sqlx_migrations WHERE success <> 1')
if [[ $failed_migrations != "0" ]]; then
  echo "Database contains failed migrations" >&2
  exit 65
fi
mapfile -t applied_versions < <(mariadb --batch --skip-column-names "$database_name" \
  -e 'SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version')
if [[ ${#applied_versions[@]} -ne ${#source_versions[@]} ]]; then
  echo "Database and binary migration counts differ; use the reviewed migration workflow" >&2
  exit 65
fi
for index in "${!source_versions[@]}"; do
  if [[ ${source_versions[$index]} != "${applied_versions[$index]}" ]]; then
    echo "Database and binary migration histories differ; use the reviewed migration workflow" >&2
    exit 65
  fi
done

curl_common=(--silent --show-error --max-time 12 --user-agent "MediaBackendReleaseCanary/1.0")

require_status() {
  local label=$1
  local expected=$2
  shift 2
  local actual
  actual=$(curl "${curl_common[@]}" --output /dev/null --write-out '%{http_code}' "$@") || return 1
  if [[ $actual != "$expected" ]]; then
    echo "Canary $label returned $actual; expected $expected" >&2
    return 1
  fi
}

wait_for_ready() {
  local url=$1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if [[ $(curl "${curl_common[@]}" --output /dev/null --write-out '%{http_code}' "$url" 2>/dev/null || true) == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

candidate_started=0
cleanup() {
  if [[ $candidate_started -eq 1 ]]; then
    systemctl stop "$canary_unit" >/dev/null 2>&1 || true
  fi
  systemctl reset-failed "$canary_unit" >/dev/null 2>&1 || true
  for temporary_binary in "$live_next" "$live_rollback"; do
    if [[ -f $temporary_binary && ! -L $temporary_binary ]]; then
      find "$temporary_binary" -maxdepth 0 -type f -delete
    fi
  done
}
trap cleanup EXIT

install -d -o root -g root -m 0750 "$candidate_root"
install -o root -g root -m 0755 "$source_binary" "$candidate_binary"
if [[ $(sha256sum -- "$candidate_binary" | awk '{print $1}') != "$source_hash" ]]; then
  echo "Candidate binary integrity check failed" >&2
  exit 74
fi

# The positional parameters are intentionally expanded by the isolated shell.
# shellcheck disable=SC2016
systemd-run --unit="$canary_unit" --collect --service-type=exec \
  --uid=www-data --gid=www-data --working-directory="$backend_root" \
  --property="EnvironmentFile=$environment_file" --property=TimeoutStopSec=15s \
  /bin/sh -c 'export SERVER_HOST=127.0.0.1 SERVER_PORT="$1" UPLOAD_MAINTENANCE_ENABLED=false; exec "$2"' \
  media-backend-canary "$canary_port" "$candidate_binary" >/dev/null
candidate_started=1

if ! wait_for_ready "http://127.0.0.1:$canary_port/api/health/ready" \
    || ! require_status candidate-live 200 "http://127.0.0.1:$canary_port/api/health/live" \
    || ! require_status candidate-posts 200 "http://127.0.0.1:$canary_port/api/posts?limit=1&offset=0" \
    || ! require_status candidate-auth-boundary 401 "http://127.0.0.1:$canary_port/api/auth/me" \
    || ! require_status candidate-pagination-boundary 400 "http://127.0.0.1:$canary_port/api/posts?limit=101&offset=0"; then
  echo "Isolated candidate canary failed; live binary was not changed" >&2
  exit 1
fi
candidate_log=$(journalctl -u "$canary_unit" --no-pager --output=cat)
if [[ $candidate_log != *"database migrations are current"* \
      || $candidate_log != *"upload maintenance disabled for this process"* ]]; then
  echo "Candidate did not prove migration parity and maintenance isolation" >&2
  exit 1
fi

systemctl stop "$canary_unit"
candidate_started=0
systemctl reset-failed "$canary_unit" >/dev/null 2>&1 || true
if ss -ltnH "( sport = :$canary_port )" | grep -q .; then
  echo "Candidate listener remained after shutdown" >&2
  exit 1
fi

install -o root -g root -m 0700 "$live_binary" "$backup_binary"
if [[ $(sha256sum -- "$backup_binary" | awk '{print $1}') != "$live_hash" ]]; then
  echo "Rollback binary integrity check failed" >&2
  exit 74
fi

rollback_live() {
  echo "Production canary failed; restoring the prior binary" >&2
  install -o root -g root -m 0755 "$backup_binary" "$live_rollback" || return 1
  mv -- "$live_rollback" "$live_binary" || return 1
  systemctl restart social-media.service || return 1
  wait_for_ready 'http://127.0.0.1:8083/api/health/ready' || return 1
  if [[ $(sha256sum -- "$live_binary" | awk '{print $1}') != "$live_hash" ]]; then
    return 1
  fi
  echo "rollback=performed"
}

promote_and_canary() {
  install -o root -g root -m 0755 "$candidate_binary" "$live_next" || return 1
  mv -- "$live_next" "$live_binary" || return 1
  systemctl restart social-media.service || return 1
  wait_for_ready 'http://127.0.0.1:8083/api/health/ready' || return 1
  require_status direct-live 200 'http://127.0.0.1:8083/api/health/live' || return 1
  require_status direct-posts 200 'http://127.0.0.1:8083/api/posts?limit=1&offset=0' || return 1
  require_status direct-auth-boundary 401 'http://127.0.0.1:8083/api/auth/me' || return 1
  require_status direct-pagination-boundary 400 'http://127.0.0.1:8083/api/posts?limit=101&offset=0' || return 1
  require_status tunnel-ready 200 --resolve "$resolve_origin" "$origin/api/health/ready?release=$release_id" || return 1
  require_status public-ready 200 "$origin/api/health/ready?release=$release_id" || return 1
  require_status public-posts 200 "$origin/api/posts?limit=1&offset=0&release=$release_id" || return 1
  if [[ $(sha256sum -- "$live_binary" | awk '{print $1}') != "$source_hash" ]]; then
    echo "Promoted binary hash differs from the candidate" >&2
    return 1
  fi
  for service in social-media.service nginx.service cloudflared.service; do
    systemctl is-active --quiet "$service" || return 1
  done
  [[ $(systemctl show social-media.service -p NRestarts --value) == "0" ]] || return 1
}

if ! promote_and_canary; then
  rollback_live || {
    echo "Automatic backend rollback failed; follow the incident runbook immediately" >&2
    exit 2
  }
  exit 1
fi

echo "release=$candidate_binary"
echo "release_sha256=$source_hash"
echo "rollback_binary=$backup_binary"
echo "rollback_sha256=$live_hash"
echo "latest_migration=$latest_source_migration"
echo "rollback=not-needed"
