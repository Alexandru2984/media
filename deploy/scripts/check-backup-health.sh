#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly state_root="/var/lib/social-media-backup"
readonly backup_status="$state_root/last-success.env"
readonly restore_status="$state_root/last-restore-drill.env"
readonly maximum_backup_age_seconds=108000
readonly maximum_restore_age_seconds=777600
readonly future_tolerance_seconds=300

for command in awk date stat; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done

metadata_value() {
  local status_file=$1
  local key=$2
  awk -F= -v wanted="$key" '
    $1 == wanted { count++; value=substr($0, index($0, "=") + 1) }
    END { if (count == 1) print value; else exit 1 }
  ' "$status_file"
}

validate_status_file() {
  local status_file=$1
  if [[ ! -f $status_file || -L $status_file ]]; then
    echo "Backup health status is missing or unsafe: $status_file" >&2
    exit 66
  fi
  if [[ $(stat -c '%U:%G:%a' "$status_file") != "root:root:600" ]]; then
    echo "Backup health status has unsafe ownership or mode: $status_file" >&2
    exit 77
  fi
}

status_age() {
  local status_file=$1
  local completed_at
  local completed_epoch
  local now_epoch
  completed_at=$(metadata_value "$status_file" COMPLETED_AT)
  if [[ ! $completed_at =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "Backup health timestamp is invalid: $status_file" >&2
    exit 65
  fi
  if ! completed_epoch=$(date -u -d "$completed_at" +%s); then
    echo "Backup health timestamp cannot be parsed: $status_file" >&2
    exit 65
  fi
  now_epoch=$(date -u +%s)
  if (( completed_epoch > now_epoch + future_tolerance_seconds )); then
    echo "Backup health timestamp is unexpectedly in the future: $status_file" >&2
    exit 65
  fi
  echo $((now_epoch - completed_epoch))
}

validate_status_file "$backup_status"
validate_status_file "$restore_status"

backup_id=$(metadata_value "$backup_status" BACKUP_ID)
restore_backup_id=$(metadata_value "$restore_status" BACKUP_ID)
backup_verified=$(metadata_value "$backup_status" REMOTE_DOWNLOAD_VERIFIED)
temporary_database_removed=$(metadata_value "$restore_status" TEMPORARY_DATABASE_REMOVED)
local_staging_removed=$(metadata_value "$restore_status" LOCAL_STAGING_REMOVED)
if [[ ! $backup_id =~ ^[0-9]{8}T[0-9]{6}Z$ || \
      ! $restore_backup_id =~ ^[0-9]{8}T[0-9]{6}Z$ || \
      $backup_verified != "yes" || $temporary_database_removed != "yes" || \
      $local_staging_removed != "on-exit" ]]; then
  echo "Backup health evidence failed strict validation" >&2
  exit 74
fi

backup_age_seconds=$(status_age "$backup_status")
restore_age_seconds=$(status_age "$restore_status")
if (( backup_age_seconds > maximum_backup_age_seconds )); then
  echo "Latest verified off-site backup is stale" >&2
  exit 1
fi
if (( restore_age_seconds > maximum_restore_age_seconds )); then
  echo "Latest off-site restore drill is stale" >&2
  exit 1
fi

echo "backup_health=passed"
echo "backup_id=$backup_id"
echo "backup_age_seconds=$backup_age_seconds"
echo "restore_backup_id=$restore_backup_id"
echo "restore_age_seconds=$restore_age_seconds"
echo "backup_maximum_age_seconds=$maximum_backup_age_seconds"
echo "restore_maximum_age_seconds=$maximum_restore_age_seconds"
