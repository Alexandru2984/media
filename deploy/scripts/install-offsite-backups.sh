#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly repository_root="/var/www/media.micutu.com"
readonly source_config="/home/micu/.config/rclone/rclone.conf"
readonly config_root="/etc/social-media"
readonly target_config="$config_root/rclone-backup.conf"
readonly installed_backup="/usr/local/libexec/social-media-backup"
readonly installed_restore_drill="/usr/local/libexec/social-media-restore-drill"
readonly installed_health_check="/usr/local/libexec/social-media-backup-health"

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

for command in awk chmod find install jq mktemp rclone sha256sum stat systemctl; do
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
  "$repository_root/deploy/scripts/check-backup-health.sh" \
  "$repository_root/deploy/scripts/drill-offsite-restore.sh" \
  "$repository_root/deploy/systemd/social-media-backup.service" \
  "$repository_root/deploy/systemd/social-media-backup.timer" \
  "$repository_root/deploy/systemd/social-media-backup-health.service" \
  "$repository_root/deploy/systemd/social-media-backup-health.timer" \
  "$repository_root/deploy/systemd/social-media-restore-drill.service" \
  "$repository_root/deploy/systemd/social-media-restore-drill.timer"; do
  if [[ ! -f $tracked_file || -L $tracked_file ]]; then
    echo "Tracked deployment file is missing or unsafe: $tracked_file" >&2
    exit 66
  fi
done
if ! systemctl cat swift-vapor-alert@.service >/dev/null 2>&1; then
  echo "The existing operator alert service is unavailable" >&2
  exit 66
fi

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "source_config_owner=micu:micu"
  echo "dedicated_sections=gdrive,gdrive-vps-crypt"
  echo "drive_root=VPS-Backups-Encrypted-folder-id"
  echo "target_config=$target_config"
  echo "backup_executable=$installed_backup"
  echo "restore_executable=$installed_restore_drill"
  echo "health_executable=$installed_health_check"
  echo "timer=social-media-backup.timer"
  echo "health_timer=social-media-backup-health.timer"
  echo "restore_timer=social-media-restore-drill.timer"
  exit 0
fi

install -d -o root -g root -m 0700 "$config_root"
temporary_config=$(mktemp --tmpdir="$config_root" .rclone-backup.conf.XXXXXX)
source_snapshot=$(mktemp --tmpdir="$config_root" .rclone-source.conf.XXXXXX)
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
  if [[ -n ${source_snapshot:-} && -f $source_snapshot ]]; then
    case "$source_snapshot" in
      /etc/social-media/.rclone-source.conf.*)
        find "$source_snapshot" -maxdepth 0 -type f -delete
        ;;
      *) echo "Refusing to remove unexpected source snapshot" >&2 ;;
    esac
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

source_hash_before=$(sha256sum -- "$source_config" | awk '{print $1}')
install -o root -g root -m 0600 "$source_config" "$source_snapshot"
source_hash_after=$(sha256sum -- "$source_config" | awk '{print $1}')
if [[ $source_hash_before != "$source_hash_after" ]]; then
  echo "Source rclone configuration changed while it was snapshotted" >&2
  exit 75
fi

mapfile -t backup_folder_ids < <(rclone --config "$source_snapshot" \
  lsjson "gdrive:" --dirs-only --max-depth 1 | \
  jq -r '.[] | select(.Name == "VPS-Backups-Encrypted") | .ID')
if [[ ${#backup_folder_ids[@]} -ne 1 || \
      ! ${backup_folder_ids[0]} =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Expected exactly one encrypted Google Drive backup folder" >&2
  exit 65
fi
backup_folder_id=${backup_folder_ids[0]}
awk -v root_id="$backup_folder_id" '
  $0 == "[gdrive]" {
    section="gdrive"; wanted=1; root_written=0; print; next
  }
  $0 == "[gdrive-vps-crypt]" {
    if (section == "gdrive" && !root_written) print "root_folder_id = " root_id
    section="crypt"; wanted=1; print; next
  }
  /^\[/ {
    if (section == "gdrive" && !root_written) print "root_folder_id = " root_id
    section="other"; wanted=0; next
  }
  section == "gdrive" && /^[[:space:]]*root_folder_id[[:space:]]*=/ {
    if (!root_written) print "root_folder_id = " root_id
    root_written=1; next
  }
  section == "crypt" && /^[[:space:]]*remote[[:space:]]*=/ {
    print "remote = gdrive:"; next
  }
  wanted { print }
  END {
    if (section == "gdrive" && !root_written) print "root_folder_id = " root_id
  }
' "$source_snapshot" >"$temporary_config"
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

dedicated_root_id=$(awk '
  $0 == "[gdrive]" { wanted=1; next }
  /^\[/ { wanted=0 }
  wanted && /^[[:space:]]*root_folder_id[[:space:]]*=/ {
    sub(/^[^=]*=[[:space:]]*/, ""); print; exit
  }
' "$temporary_config")
dedicated_crypt_target=$(awk '
  $0 == "[gdrive-vps-crypt]" { wanted=1; next }
  /^\[/ { wanted=0 }
  wanted && /^[[:space:]]*remote[[:space:]]*=/ {
    sub(/^[^=]*=[[:space:]]*/, ""); print; exit
  }
' "$temporary_config")
if [[ $dedicated_root_id != "$backup_folder_id" || \
      $dedicated_crypt_target != "gdrive:" ]]; then
  echo "Dedicated rclone configuration is not pinned to the encrypted folder" >&2
  exit 65
fi

install -o root -g root -m 0600 "$temporary_config" "$target_config"
find "$temporary_config" -maxdepth 0 -type f -delete
temporary_config=""
find "$source_snapshot" -maxdepth 0 -type f -delete
source_snapshot=""

install -d -o root -g root -m 0700 /var/backups/social-media-offsite
install -o root -g root -m 0755 \
  "$repository_root/deploy/scripts/backup-offsite.sh" "$installed_backup"
install -o root -g root -m 0755 \
  "$repository_root/deploy/scripts/check-backup-health.sh" \
  "$installed_health_check"
install -o root -g root -m 0755 \
  "$repository_root/deploy/scripts/drill-offsite-restore.sh" \
  "$installed_restore_drill"
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup.service" \
  /etc/systemd/system/social-media-backup.service
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup.timer" \
  /etc/systemd/system/social-media-backup.timer
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup-health.service" \
  /etc/systemd/system/social-media-backup-health.service
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-backup-health.timer" \
  /etc/systemd/system/social-media-backup-health.timer
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-restore-drill.service" \
  /etc/systemd/system/social-media-restore-drill.service
install -o root -g root -m 0644 \
  "$repository_root/deploy/systemd/social-media-restore-drill.timer" \
  /etc/systemd/system/social-media-restore-drill.timer
systemctl daemon-reload
systemctl enable --now social-media-backup.timer social-media-backup-health.timer \
  social-media-restore-drill.timer

echo "install=passed"
echo "dedicated_config=$target_config"
echo "drive_root_pinned=yes"
echo "executables_root_owned=yes"
echo "timer=social-media-backup.timer"
echo "health_timer=social-media-backup-health.timer"
echo "restore_timer=social-media-restore-drill.timer"
echo "backup_started=no"
