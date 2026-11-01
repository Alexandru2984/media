#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
export LC_ALL=C

readonly credential_file="/etc/social-media/cloudflare-purge.json"
readonly public_origin="https://media.micutu.com"
readonly origin_resolution="media.micutu.com:443:127.0.0.1"
readonly cloudflare_api="https://api.cloudflare.com/client/v4"

usage() {
  echo "Usage: sudo $0 /uploads/{avatars|posts}/<managed-image>" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 64
fi
if [[ $EUID -ne 0 ]]; then
  echo "Cloudflare upload purge requires root" >&2
  exit 77
fi

upload_path=$1
if [[ ! $upload_path =~ ^/uploads/(avatars|posts)/[A-Za-z0-9][A-Za-z0-9_-]{0,199}\.(jpg|jpeg|png|webp)$ ]]; then
  echo "Upload path is outside the strict managed-image allowlist" >&2
  exit 65
fi

for command in awk curl jq sleep stat; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ ! -f $credential_file || -L $credential_file ]]; then
  echo "Dedicated Cloudflare purge credential is missing or unsafe" >&2
  exit 66
fi
if [[ $(stat -c '%U:%G:%a' "$credential_file") != "root:root:600" ]]; then
  echo "Cloudflare purge credential must be root:root mode 0600" >&2
  exit 77
fi
if ! jq -e '
  type == "object" and
  (keys | sort) == ["api_token", "zone_id"] and
  (.api_token | type == "string" and
    test("^[A-Za-z0-9._~-]{20,512}$")) and
  (.zone_id | type == "string" and test("^[A-Fa-f0-9]{32}$"))
' "$credential_file" >/dev/null; then
  echo "Cloudflare purge credential has an invalid structure" >&2
  exit 65
fi

api_token=$(jq -er '.api_token' "$credential_file")
zone_id=$(jq -er '.zone_id' "$credential_file")
target_url="$public_origin$upload_path"

if ! origin_headers=$(curl --silent --show-error --dump-header - \
  --output /dev/null --connect-timeout 3 --max-time 10 --proto '=https' \
  --noproxy '*' \
  --user-agent 'social-media-cache-purge/1.0' \
  --resolve "$origin_resolution" "$target_url"); then
  echo "Unable to verify the direct origin before purge" >&2
  exit 69
fi
origin_status=$(awk '/^HTTP\// { status=$2 } END { print status }' \
  <<<"$origin_headers")
origin_cache_control=$(awk '
  BEGIN { IGNORECASE=1 }
  /^cache-control:/ {
    sub(/^[^:]+:[[:space:]]*/, "")
    gsub("\r", "")
    value=$0
  }
  END { print value }
' <<<"$origin_headers")
if [[ $origin_status != "404" || \
      ${origin_cache_control,,} != *"no-store"* ]]; then
  echo "Refusing purge because origin is not a no-store 404" >&2
  echo "origin_status=${origin_status:-unavailable}" >&2
  exit 1
fi

payload=$(jq -cn --arg url "$target_url" '{files: [$url]}')
if ! response=$(printf \
  'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' \
  "$api_token" | curl --silent --show-error --config - \
    --connect-timeout 5 --max-time 20 --proto '=https' --noproxy '*' \
    --request POST --data "$payload" \
    --write-out '\n%{http_code}' \
    "$cloudflare_api/zones/$zone_id/purge_cache"); then
  echo "Cloudflare purge request failed at the transport layer" >&2
  exit 69
fi
api_status=${response##*$'\n'}
response_body=${response%$'\n'*}
if [[ $api_status != "200" ]] || \
    ! jq -e '.success == true' >/dev/null <<<"$response_body"; then
  echo "Cloudflare rejected the exact-URL purge" >&2
  echo "cloudflare_http_status=$api_status" >&2
  jq -r '.errors[]? | "cloudflare_error_code=\(.code) message=\(.message)"' \
    <<<"$response_body" >&2 || true
  exit 1
fi

public_status="unavailable"
cache_status="unavailable"
for attempt in 1 2 3 4 5; do
  if public_headers=$(curl --silent --show-error --dump-header - \
    --output /dev/null --connect-timeout 3 --max-time 10 --proto '=https' \
    --noproxy '*' \
    --user-agent 'social-media-cache-purge/1.0' "$target_url"); then
    public_status=$(awk '/^HTTP\// { status=$2 } END { print status }' \
      <<<"$public_headers")
    cache_status=$(awk '
      BEGIN { IGNORECASE=1 }
      /^cf-cache-status:/ {
        sub(/^[^:]+:[[:space:]]*/, "")
        gsub("\r", "")
        value=toupper($0)
      }
      END { print value }
    ' <<<"$public_headers")
    if [[ $public_status == "404" && \
          $cache_status =~ ^(BYPASS|DYNAMIC|EXPIRED|MISS)$ ]]; then
      echo "cloudflare_upload_purge=passed"
      echo "upload_path=$upload_path"
      echo "origin_status=404"
      echo "public_status=404"
      echo "cf_cache_status=$cache_status"
      exit 0
    fi
  fi
  if (( attempt < 5 )); then
    sleep 2
  fi
done

echo "Cloudflare accepted the purge but public verification failed" >&2
echo "public_status=$public_status" >&2
echo "cf_cache_status=$cache_status" >&2
exit 1
