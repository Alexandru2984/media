#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly direct_api="http://127.0.0.1:8083"
readonly public_origin="https://media.micutu.com"
readonly origin_resolution="media.micutu.com:443:127.0.0.1"
readonly maximum_attempts=2

for command in curl sleep systemctl; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done

check_service() {
  local service_name=$1
  if ! systemctl is-active --quiet "$service_name"; then
    echo "Required production service is not active: $service_name" >&2
    return 1
  fi
}

check_http() {
  local check_name=$1
  local expected_status=$2
  local attempt
  local actual_status="transport-error"
  shift 2

  for ((attempt = 1; attempt <= maximum_attempts; attempt++)); do
    if actual_status=$(curl --silent --show-error --output /dev/null \
      --write-out '%{http_code}' --connect-timeout 3 --max-time 8 \
      --user-agent 'social-media-service-health/1.0' "$@"); then
      if [[ $actual_status == "$expected_status" ]]; then
        return 0
      fi
    else
      actual_status="transport-error"
    fi
    if (( attempt < maximum_attempts )); then
      sleep 1
    fi
  done

  echo "Health boundary failed: $check_name expected=$expected_status actual=$actual_status" >&2
  return 1
}

failures=0
for service_name in social-media.service nginx.service cloudflared.service mysql.service; do
  if ! check_service "$service_name"; then
    ((failures += 1))
  fi
done

if ! check_http direct-ready 200 --proto '=http' \
  "$direct_api/api/health/ready"; then
  ((failures += 1))
fi
if ! check_http direct-auth-boundary 401 --proto '=http' \
  "$direct_api/api/auth/me"; then
  ((failures += 1))
fi
if ! check_http direct-pagination-boundary 400 --proto '=http' \
  "$direct_api/api/posts?limit=101&offset=0"; then
  ((failures += 1))
fi
if ! check_http origin-ready 200 --proto '=https' \
  --resolve "$origin_resolution" "$public_origin/api/health/ready"; then
  ((failures += 1))
fi
if ! check_http origin-homepage 200 --proto '=https' \
  --resolve "$origin_resolution" "$public_origin/"; then
  ((failures += 1))
fi
if ! check_http tunnel-ready 200 --proto '=https' \
  "$public_origin/api/health/ready"; then
  ((failures += 1))
fi
if ! check_http tunnel-homepage 200 --proto '=https' "$public_origin/"; then
  ((failures += 1))
fi

api_restart_count=$(systemctl show social-media.service --property=NRestarts \
  --value)
if [[ ! $api_restart_count =~ ^[0-9]+$ ]]; then
  echo "API restart count is unavailable or invalid" >&2
  ((failures += 1))
fi

if (( failures > 0 )); then
  echo "service_health=failed" >&2
  echo "failed_checks=$failures" >&2
  exit 1
fi

echo "service_health=passed"
echo "services_active=4"
echo "http_boundaries_passed=7"
echo "api_restart_count=$api_restart_count"
