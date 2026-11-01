#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly repository_root="/var/www/media.micutu.com"
readonly source_script="$repository_root/deploy/scripts/purge-cloudflare-upload.sh"
readonly installed_script="/usr/local/libexec/social-media-purge-upload-cache"
readonly config_root="/etc/social-media"
readonly credential_file="$config_root/cloudflare-purge.json"

usage() {
  echo "Usage: sudo $0 [--dry-run]" >&2
}

dry_run=0
if [[ ${1:-} == "--dry-run" ]]; then
  dry_run=1
  shift
fi
if [[ $# -ne 0 ]]; then
  usage
  exit 64
fi
if [[ $EUID -ne 0 ]]; then
  echo "Installing the Cloudflare purge tool requires root" >&2
  exit 77
fi
for command in install stat; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ ! -f $source_script || -L $source_script ]]; then
  echo "Tracked purge script is missing or unsafe" >&2
  exit 66
fi

credential_state="missing"
if [[ -e $credential_file || -L $credential_file ]]; then
  if [[ ! -f $credential_file || -L $credential_file ]]; then
    echo "Cloudflare purge credential path is unsafe" >&2
    exit 66
  fi
  if [[ $(stat -c '%U:%G:%a' "$credential_file") != "root:root:600" ]]; then
    echo "Cloudflare purge credential must be root:root mode 0600" >&2
    exit 77
  fi
  credential_state="present"
fi

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "installed_script=$installed_script"
  echo "credential_file=$credential_file"
  echo "credential_state=$credential_state"
  exit 0
fi

install -d -o root -g root -m 0700 "$config_root"
install -o root -g root -m 0755 "$source_script" "$installed_script"

echo "install=passed"
echo "installed_script=$installed_script"
echo "credential_file=$credential_file"
echo "credential_state=$credential_state"
