#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

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
source_dir="$repository_root/frontend/dist"
releases_root=/var/lib/media/frontend-releases
current_link=/var/lib/media/frontend-current
release_dir="$releases_root/$release_id"
origin=https://media.micutu.com
resolve_origin=media.micutu.com:443:127.0.0.1

for required_file in index.html manifest.webmanifest sitemap.xml robots.txt; do
  if [[ ! -f "$source_dir/$required_file" || -L "$source_dir/$required_file" ]]; then
    echo "Missing or unsafe release file: $source_dir/$required_file" >&2
    exit 66
  fi
done
for required_dir in assets icons; do
  if [[ ! -d "$source_dir/$required_dir" || -L "$source_dir/$required_dir" ]]; then
    echo "Missing or unsafe release directory: $source_dir/$required_dir" >&2
    exit 66
  fi
done
if find "$source_dir" -type l -print -quit | grep -q .; then
  echo "Release artifacts must not contain symbolic links" >&2
  exit 66
fi

if [[ ! -L $current_link ]]; then
  echo "Current frontend pointer is not a symbolic link: $current_link" >&2
  exit 65
fi
current_target=$(readlink -f -- "$current_link")
case "$current_target" in
  "$releases_root"/*) ;;
  *)
    echo "Current frontend target escapes the release root: $current_target" >&2
    exit 65
    ;;
esac
if [[ ! -d $current_target ]]; then
  echo "Current frontend release does not exist: $current_target" >&2
  exit 65
fi
if [[ -e $release_dir || -L $release_dir ]]; then
  echo "Release target already exists: $release_dir" >&2
  exit 73
fi

source_file_count=$(find "$source_dir" -type f | wc -l)
source_index_hash=$(sha256sum -- "$source_dir/index.html" | awk '{print $1}')
source_manifest_hash=$(sha256sum -- "$source_dir/manifest.webmanifest" | awk '{print $1}')
source_sitemap_hash=$(sha256sum -- "$source_dir/sitemap.xml" | awk '{print $1}')

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "source=$source_dir"
  echo "current=$current_target"
  echo "candidate=$release_dir"
  echo "files=$source_file_count"
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Production activation requires root; rerun with sudo" >&2
  exit 77
fi

staging_dir=$(mktemp -d -- "$releases_root/.staging-$release_id.XXXXXX")
next_link="$current_link.next-$release_id"
rollback_link="$current_link.rollback-$release_id"

cleanup() {
  if [[ -L $next_link ]]; then unlink -- "$next_link"; fi
  if [[ -L $rollback_link ]]; then unlink -- "$rollback_link"; fi
  if [[ -n ${staging_dir:-} && -d $staging_dir ]]; then
    case "$staging_dir" in
      "$releases_root"/.staging-"$release_id".*) find "$staging_dir" -depth -delete ;;
      *) echo "Refusing to clean unexpected staging path: $staging_dir" >&2 ;;
    esac
  fi
}
trap cleanup EXIT

cp -a -- "$source_dir/." "$staging_dir/"
chown -R root:root "$staging_dir"
find "$staging_dir" -type d -exec chmod 0755 {} +
find "$staging_dir" -type f -exec chmod 0644 {} +

staged_file_count=$(find "$staging_dir" -type f | wc -l)
staged_index_hash=$(sha256sum -- "$staging_dir/index.html" | awk '{print $1}')
staged_manifest_hash=$(sha256sum -- "$staging_dir/manifest.webmanifest" | awk '{print $1}')
staged_sitemap_hash=$(sha256sum -- "$staging_dir/sitemap.xml" | awk '{print $1}')
if [[ $staged_file_count -ne $source_file_count
      || $staged_index_hash != "$source_index_hash"
      || $staged_manifest_hash != "$source_manifest_hash"
      || $staged_sitemap_hash != "$source_sitemap_hash" ]]; then
  echo "Staged release integrity check failed" >&2
  exit 74
fi

mv -- "$staging_dir" "$release_dir"
staging_dir=
ln -s -- "$release_dir" "$next_link"
mv -T -- "$next_link" "$current_link"

curl_common=(--silent --show-error --max-time 12 --user-agent "MediaReleaseCanary/1.0")

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

require_content() {
  local label=$1
  local marker=$2
  shift 2
  if ! curl "${curl_common[@]}" --fail "$@" | grep -Fq -- "$marker"; then
    echo "Canary $label is missing its required marker" >&2
    return 1
  fi
}

run_canaries() {
  local cache_buster="release=$release_id"
  require_status direct-root 200 --resolve "$resolve_origin" "$origin/?$cache_buster" || return 1
  require_content direct-manifest '"id": "/"' --resolve "$resolve_origin" "$origin/manifest.webmanifest?$cache_buster" || return 1
  require_content direct-sitemap '<urlset' --resolve "$resolve_origin" "$origin/sitemap.xml?$cache_buster" || return 1
  require_status direct-api-ready 200 --resolve "$resolve_origin" "$origin/api/health/ready?$cache_buster" || return 1
  require_status public-root 200 "$origin/?$cache_buster" || return 1
  require_content public-manifest '"id": "/"' "$origin/manifest.webmanifest?$cache_buster" || return 1
  require_content public-sitemap '<urlset' "$origin/sitemap.xml?$cache_buster" || return 1
  require_status public-api-ready 200 "$origin/api/health/ready?$cache_buster" || return 1
  require_status public-not-found 404 "$origin/release-canary-not-found-$release_id" || return 1
}

if ! run_canaries; then
  echo "Release canary failed; restoring $current_target" >&2
  ln -s -- "$current_target" "$rollback_link"
  mv -T -- "$rollback_link" "$current_link"
  require_status rollback-direct-root 200 --resolve "$resolve_origin" "$origin/" || true
  echo "rollback=performed"
  exit 1
fi

echo "release=$release_dir"
echo "rollback_target=$current_target"
echo "rollback=not-needed"
