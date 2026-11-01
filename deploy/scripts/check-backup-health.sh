#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly state_root="/var/lib/social-media-backup"
readonly upload_root="/var/www/media.micutu.com/backend/uploads"
readonly database_name="social_media"
readonly backup_status="$state_root/last-success.env"
readonly restore_status="$state_root/last-restore-drill.env"
readonly maximum_backup_age_seconds=108000
readonly maximum_restore_age_seconds=777600
readonly future_tolerance_seconds=300

for command in awk chmod comm date find mariadb mktemp sort stat; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ $EUID -ne 0 ]]; then
  echo "Backup health validation requires the local MariaDB root session" >&2
  exit 77
fi
if [[ ! -d $upload_root || -L $upload_root ]]; then
  echo "Upload root is missing or unsafe" >&2
  exit 66
fi

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

temporary_root=$(mktemp -d -- /tmp/social-media-upload-health.XXXXXX)
chmod 0700 "$temporary_root"
cleanup() {
  local cleanup_status=$?
  if [[ -d ${temporary_root:-} ]]; then
    case "$temporary_root" in
      /tmp/social-media-upload-health.*)
        find "$temporary_root" -xdev -depth -delete
        ;;
      *) echo "Refusing to remove unexpected health-check path" >&2 ;;
    esac
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

unsafe_upload_entry=$(find -P "$upload_root" -xdev -mindepth 1 \
  ! -type f ! -type d -print -quit)
if [[ -n $unsafe_upload_entry ]]; then
  echo "Upload root contains a non-file, non-directory entry" >&2
  exit 74
fi
while IFS= read -r upload_directory; do
  if [[ -n $upload_directory && $upload_directory != "avatars" && \
        $upload_directory != "posts" ]]; then
    echo "Upload root contains an unexpected directory" >&2
    exit 74
  fi
done < <(find -P "$upload_root" -xdev -type d -printf '%P\n')

expected_urls="$temporary_root/expected-urls"
physical_urls="$temporary_root/physical-urls"
mariadb --batch --skip-column-names --raw "$database_name" -e \
  "SELECT avatar_url AS url FROM users WHERE avatar_url LIKE '/uploads/%'
   UNION SELECT image_url FROM posts WHERE image_url LIKE '/uploads/%'
   UNION SELECT url FROM managed_uploads WHERE url LIKE '/uploads/%'
   UNION SELECT url FROM upload_deletion_queue WHERE url LIKE '/uploads/%'" | \
  LC_ALL=C sort -u >"$expected_urls"
find -P "$upload_root" -xdev -type f -printf '/uploads/%P\n' | \
  LC_ALL=C sort -u >"$physical_urls"

for url_list in "$expected_urls" "$physical_urls"; do
  while IFS= read -r upload_url; do
    if [[ -n $upload_url && \
          ! $upload_url =~ ^/uploads/(avatars|posts)/[A-Za-z0-9._-]+$ ]]; then
      echo "Upload inventory contains an unsafe URL or path" >&2
      exit 74
    fi
  done <"$url_list"
done

orphan_files=$(comm -23 "$physical_urls" "$expected_urls" | \
  awk 'NF { count++ } END { print count + 0 }')
missing_files=$(comm -13 "$physical_urls" "$expected_urls" | \
  awk 'NF { count++ } END { print count + 0 }')
physical_files=$(awk 'NF { count++ } END { print count + 0 }' "$physical_urls")
expected_files=$(awk 'NF { count++ } END { print count + 0 }' "$expected_urls")
if [[ $orphan_files != "0" || $missing_files != "0" ]]; then
  echo "Upload filesystem and database inventory differ" >&2
  echo "orphan_upload_files=$orphan_files" >&2
  echo "missing_upload_files=$missing_files" >&2
  exit 1
fi

echo "backup_health=passed"
echo "backup_id=$backup_id"
echo "backup_age_seconds=$backup_age_seconds"
echo "restore_backup_id=$restore_backup_id"
echo "restore_age_seconds=$restore_age_seconds"
echo "backup_maximum_age_seconds=$maximum_backup_age_seconds"
echo "restore_maximum_age_seconds=$maximum_restore_age_seconds"
echo "physical_upload_files=$physical_files"
echo "expected_upload_files=$expected_files"
echo "orphan_upload_files=0"
echo "missing_upload_files=0"
