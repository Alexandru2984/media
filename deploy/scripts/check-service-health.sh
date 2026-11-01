#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly direct_api="http://127.0.0.1:8083"
readonly public_origin="https://media.micutu.com"
readonly origin_resolution="media.micutu.com:443:127.0.0.1"
readonly maximum_attempts=2
readonly maximum_filesystem_use_percent=85
readonly maximum_inode_use_percent=85
readonly minimum_free_bytes=10737418240
readonly certificate_minimum_validity_seconds=1209600

for command in awk curl df openssl sleep systemctl timeout; do
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

check_certificate() {
  local check_name=$1
  local connection=$2
  local server_name=$3
  local certificate

  if ! certificate=$(timeout 10 openssl s_client -connect "$connection" \
    -servername "$server_name" -verify_return_error </dev/null 2>/dev/null | \
    openssl x509 -outform PEM 2>/dev/null); then
    echo "Unable to retrieve or verify certificate: $check_name" >&2
    return 1
  fi
  if ! openssl x509 -checkend "$certificate_minimum_validity_seconds" \
    -noout <<<"$certificate" >/dev/null 2>&1; then
    echo "Certificate expires inside the required 14-day window: $check_name" >&2
    return 1
  fi
}

filesystem_use_percent="unavailable"
filesystem_inode_use_percent="unavailable"
filesystem_free_bytes="unavailable"
check_filesystem_capacity() {
  local block_inventory
  local inode_inventory

  if ! block_inventory=$(df -P -B1 / | awk '
    NR == 2 { gsub(/%/, "", $5); print $5, $4 }
  ') || ! inode_inventory=$(df -Pi / | awk '
    NR == 2 { gsub(/%/, "", $5); print $5 }
  '); then
    echo "Unable to inspect root filesystem capacity" >&2
    return 1
  fi
  read -r filesystem_use_percent filesystem_free_bytes \
    <<<"$block_inventory"
  read -r filesystem_inode_use_percent <<<"$inode_inventory"
  if [[ ! $filesystem_use_percent =~ ^[0-9]+$ || \
        ! $filesystem_inode_use_percent =~ ^[0-9]+$ || \
        ! $filesystem_free_bytes =~ ^[0-9]+$ ]]; then
    echo "Filesystem capacity inventory is invalid" >&2
    return 1
  fi
  if (( filesystem_use_percent >= maximum_filesystem_use_percent )); then
    echo "Root filesystem usage reached the alert threshold" >&2
    return 1
  fi
  if (( filesystem_inode_use_percent >= maximum_inode_use_percent )); then
    echo "Root filesystem inode usage reached the alert threshold" >&2
    return 1
  fi
  if (( filesystem_free_bytes < minimum_free_bytes )); then
    echo "Root filesystem free space is below 10 GiB" >&2
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
if ! check_certificate origin-certificate 127.0.0.1:443 media.micutu.com; then
  ((failures += 1))
fi
if ! check_certificate edge-certificate media.micutu.com:443 media.micutu.com; then
  ((failures += 1))
fi
if ! check_filesystem_capacity; then
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
echo "certificate_boundaries_passed=2"
echo "api_restart_count=$api_restart_count"
echo "filesystem_use_percent=$filesystem_use_percent"
echo "filesystem_inode_use_percent=$filesystem_inode_use_percent"
echo "filesystem_free_bytes=$filesystem_free_bytes"
