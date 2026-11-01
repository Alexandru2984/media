#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly repository_root="/var/www/media.micutu.com"
readonly source_config="/home/micu/.config/rclone/rclone.conf"
readonly config_root="/etc/social-media"
readonly target_config="$config_root/rclone-backup.conf"

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
  echo "Installing the backup service requires root" >&2
  exit 77
fi

for command in awk chmod find install mktemp rclone sha256sum stat systemctl; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ ! -f $source_config || -L $source_config ]]; then
  echo "Source rclone configuration is missing or unsafe" >&2
  exit 66
fi
if [[ $(stat -c '%U:%G:%a' "$source_config") != "micu:micu:600" ]]; then
  echo "Source rclone configuration must be micu:micu mode 0600" >&2
  exit 77
fi

gdrive_sections=$(awk '$0 == "[gdrive]" { count++ } END { print count + 0 }' "$source_config")
crypt_sections=$(awk '$0 == "[gdrive-vps-crypt]" { count++ } END { print count + 0 }' "$source_config")
gdrive_type=$(awk '
  $0 == "[gdrive]" { wanted=1; next }
  /^\[/ { wanted=0 }
  wanted && /^[[:space:]]*type[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }
' "$source_config")
crypt_type=$(awk '
  $0 == "[gdrive-vps-crypt]" { wanted=1; next }
  /^\[/ { wanted=0 }
  wanted && /^[[:space:]]*type[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }
' "$source_config")
crypt_target=$(awk '
  $0 == "[gdrive-vps-crypt]" { wanted=1; next }
  /^\[/ { wanted=0 }
  wanted && /^[[:space:]]*remote[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }
' "$source_config")

if [[ $gdrive_sections != "1" || $crypt_sections != "1" || \
      $gdrive_type != "drive" || $crypt_type != "crypt" || \
      $crypt_target != "gdrive:VPS-Backups-Encrypted" ]]; then
  echo "The expected Google Drive and crypt remotes are not configured exactly" >&2
  exit 65
fi

for tracked_file in \
  "$repository_root/deploy/scripts/backup-offsite.sh" \
  "$repository_root/deploy/systemd/social-media-backup.service" \
  "$repository_root/deploy/systemd/social-media-backup.timer"; do
  if [[ ! -f $tracked_file || -L $tracked_file ]]; then
    echo "Tracked deployment file is missing or unsafe: $tracked_file" >&2
    exit 66
  fi
done

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "source_config_owner=micu:micu"
  echo "dedicated_sections=gdrive,gdrive-vps-crypt"
  echo "target_config=$target_config"
  echo "timer=social-media-backup.timer"
  exit 0
fi

install -d -o root -g root -m 0700 "$config_root"
temporary_config=$(mktemp --tmpdir="$config_root" .rclone-backup.conf.XXXXXX)
cleanup() {
  local cleanup_status=$?
  if [[ -n ${temporary_config:-} && -f $temporary_config ]]; then
    case "$temporary_config" in
      /etc/social-media/.rclone-backup.conf.*)
        find "$temporary_config" -maxdepth 0 -type f -delete
        ;;
      *) echo "Refusing to remove unexpected temporary config" >&2 ;;
    esac
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

source_hash_before=$(sha256sum -- "$source_config" | awk '{print $1}')
awk '
  /^\[/ { wanted = ($0 == "[gdrive]" || $0 == "[gdrive-vps-crypt]") }
  wanted { print }
' "$source_config" >"$temporary_config"
source_hash_after=$(sha256sum -- "$source_config" | awk '{print $1}')
if [[ $source_hash_before != "$source_hash_after" ]]; then
  echo "Source rclone configuration changed during installation" >&2
  exit 75
fi
chmod 0600 "$temporary_config"

mapfile -t copied_remotes < <(rclone --config "$temporary_config" listremotes)
seen_gdrive=0
seen_crypt=0
for copied_remote in "${copied_remotes[@]}"; do
  [[ $copied_remote == "gdrive:" ]] && seen_gdrive=1
  [[ $copied_remote == "gdrive-vps-crypt:" ]] && seen_crypt=1
done
if [[ ${#copied_remotes[@]} -ne 2 || $seen_gdrive -ne 1 || $seen_crypt -ne 1 ]]; then
  echo "Dedicated rclone configuration contains unexpected remotes" >&2
  exit 65
fi
rclone --config "$temporary_config" about "gdrive-vps-crypt:" --json >/dev/null

install -o root -g root -m 0600 "$temporary_config" "$target_config"
find "$temporary_config" -maxdepth 0 -type f -delete
temporary_config=""

install -d -o root -g root -m 0700 /var/backups/social-media-offsite
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup.service" \
  /etc/systemd/system/social-media-backup.service
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup.timer" \
  /etc/systemd/system/social-media-backup.timer
systemctl daemon-reload
systemctl enable --now social-media-backup.timer

echo "install=passed"
echo "dedicated_config=$target_config"
echo "timer=social-media-backup.timer"
echo "backup_started=no"
