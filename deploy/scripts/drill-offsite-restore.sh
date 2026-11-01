#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly expected_database="social_media"
readonly rclone_config="/etc/social-media/rclone-backup.conf"
readonly backup_remote="gdrive-vps-crypt:media-social/backups"
readonly backup_root="/var/backups/social-media-offsite"
readonly state_root="/var/lib/social-media-backup"
readonly runtime_root="/run/social-media-backup"

usage() {
  echo "Usage: sudo $0 [--dry-run] [BACKUP_ID]" >&2
}

dry_run=0
if [[ ${1:-} == "--dry-run" ]]; then
  dry_run=1
  shift
fi
requested_backup=${1:-}
if [[ $# -gt 1 ]]; then
  usage
  exit 64
fi
if [[ -n $requested_backup && ! $requested_backup =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Invalid backup identifier" >&2
  exit 64
fi
if [[ $EUID -ne 0 ]]; then
  echo "The off-site restore drill requires the local MariaDB root session" >&2
  exit 77
fi

for command in awk cat chmod date find flock grep install mariadb mariadb-check \
  mariadb-dump mktemp mv rclone sha256sum stat tar zstd; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done
if [[ ! -f $rclone_config || -L $rclone_config || \
      $(stat -c '%U:%G:%a' "$rclone_config") != "root:root:600" ]]; then
  echo "Dedicated rclone configuration is missing or unsafe" >&2
  exit 77
fi

rclone --config "$rclone_config" about "gdrive-vps-crypt:" --json >/dev/null
valid_backups=()
while IFS= read -r remote_directory; do
  candidate=${remote_directory%/}
  if [[ $candidate =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    valid_backups+=("$candidate")
  fi
done < <(rclone --config "$rclone_config" lsf "$backup_remote" \
  --dirs-only --max-depth 1)
if [[ ${#valid_backups[@]} -eq 0 ]]; then
  echo "No valid off-site backup is available" >&2
  exit 66
fi

selected_backup=""
if [[ -n $requested_backup ]]; then
  for candidate in "${valid_backups[@]}"; do
    if [[ $candidate == "$requested_backup" ]]; then
      selected_backup=$candidate
      break
    fi
  done
  if [[ -z $selected_backup ]]; then
    echo "Requested backup does not exist below the dedicated remote prefix" >&2
    exit 66
  fi
else
  for candidate in "${valid_backups[@]}"; do
    if [[ -z $selected_backup || $candidate > $selected_backup ]]; then
      selected_backup=$candidate
    fi
  done
fi

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "backup_id=$selected_backup"
  echo "available_backups=${#valid_backups[@]}"
  echo "temporary_database_prefix=${expected_database}_offsite_drill_"
  echo "source_database_writes=none"
  exit 0
fi

install -d -m 0700 "$backup_root" "$state_root" "$runtime_root"
exec 9>"$runtime_root/operation.lock"
if ! flock -n 9; then
  echo "Another social-media backup or restore drill is already running" >&2
  exit 75
fi

started_epoch=$(date -u +%s)
drill_suffix=$(date -u +%Y%m%d_%H%M%S)
drill_database="${expected_database}_offsite_drill_${drill_suffix}"
if [[ ! $drill_database =~ ^social_media_offsite_drill_[0-9]{8}_[0-9]{6}$ || \
      $drill_database == "$expected_database" ]]; then
  echo "Generated drill database name is unsafe" >&2
  exit 65
fi
drill_exists=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$drill_database'")
if [[ $drill_exists != "0" ]]; then
  echo "Generated drill database already exists" >&2
  exit 73
fi

temporary_root=$(mktemp -d -- "$backup_root/restore.XXXXXX")
chmod 0700 "$temporary_root"
bundle_root="$temporary_root/bundle"
upload_extract_root="$temporary_root/extracted"
install -d -m 0700 "$bundle_root" "$upload_extract_root"
drill_created=0

cleanup() {
  local cleanup_status=$?
  if [[ $drill_created -eq 1 ]]; then
    case "$drill_database" in
      social_media_offsite_drill_*)
        mariadb -e "DROP DATABASE IF EXISTS \`$drill_database\`" >/dev/null 2>&1 || \
          echo "Failed to remove off-site drill database" >&2
        ;;
      *) echo "Refusing to remove unexpected drill database" >&2 ;;
    esac
  fi
  if [[ -d ${temporary_root:-} ]]; then
    case "$temporary_root" in
      /var/backups/social-media-offsite/restore.*)
        find "$temporary_root" -xdev -depth -delete
        ;;
      *) echo "Refusing to remove unexpected temporary path: $temporary_root" >&2 ;;
    esac
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

rclone --config "$rclone_config" copy \
  "$backup_remote/$selected_backup" "$bundle_root" \
  --immutable --transfers 2 --checkers 4 --retries 3 --low-level-retries 10

downloaded_file_count=$(find -P "$bundle_root" -mindepth 1 -maxdepth 1 -type f -printf . | \
  awk '{ total += length } END { print total + 0 }')
unexpected_entry=$(find -P "$bundle_root" -mindepth 1 -maxdepth 1 ! -type f -print -quit)
if [[ $downloaded_file_count != "4" || -n $unexpected_entry ]]; then
  echo "Downloaded backup has an unexpected file set" >&2
  exit 74
fi
for required_file in database.sql.zst uploads.tar.zst metadata.env SHA256SUMS; do
  if [[ ! -f $bundle_root/$required_file || -L $bundle_root/$required_file ]]; then
    echo "Downloaded backup is missing a required regular file" >&2
    exit 74
  fi
done
(
  cd "$bundle_root"
  sha256sum --check --strict SHA256SUMS
)
zstd --quiet --test "$bundle_root/database.sql.zst" "$bundle_root/uploads.tar.zst"

metadata_value() {
  local key=$1
  awk -F= -v wanted="$key" '
    $1 == wanted { count++; value=substr($0, index($0, "=") + 1) }
    END { if (count == 1) print value; else exit 1 }
  ' "$bundle_root/metadata.env"
}

format_version=$(metadata_value BACKUP_FORMAT_VERSION)
metadata_backup_id=$(metadata_value BACKUP_ID)
database_name=$(metadata_value DATABASE_NAME)
database_charset=$(metadata_value DATABASE_CHARSET)
database_collation=$(metadata_value DATABASE_COLLATION)
expected_tables=$(metadata_value DATABASE_TABLES)
expected_schema_hash=$(metadata_value DATABASE_SCHEMA_SHA256)
expected_migration_fingerprint=$(metadata_value SQLX_MIGRATION_FINGERPRINT)
if [[ $format_version != "1" || $metadata_backup_id != "$selected_backup" || \
      $database_name != "$expected_database" || \
      ! $database_charset =~ ^[A-Za-z0-9_]+$ || \
      ! $database_collation =~ ^[A-Za-z0-9_]+$ || \
      ! $expected_tables =~ ^[0-9]+$ || \
      ! $expected_schema_hash =~ ^[a-f0-9]{64}$ || \
      ! $expected_migration_fingerprint =~ ^[A-Fa-f0-9]{64}$ ]]; then
  echo "Backup metadata failed strict validation" >&2
  exit 74
fi

database_dump="$temporary_root/database.sql"
uploads_tar="$temporary_root/uploads.tar"
zstd --quiet --decompress --stdout "$bundle_root/database.sql.zst" >"$database_dump"
zstd --quiet --decompress --stdout "$bundle_root/uploads.tar.zst" >"$uploads_tar"
if [[ ! -s $database_dump || ! -s $uploads_tar ]]; then
  echo "A restored archive is empty" >&2
  exit 74
fi

unsafe_archive_path=0
while IFS= read -r archive_path; do
  if [[ $archive_path != "uploads" && $archive_path != "uploads/" && \
        $archive_path != uploads/* ]]; then
    unsafe_archive_path=1
    break
  fi
  if [[ "/$archive_path/" == *"/../"* || $archive_path == /* ]]; then
    unsafe_archive_path=1
    break
  fi
done < <(tar --list --file="$uploads_tar")
if [[ $unsafe_archive_path -ne 0 ]]; then
  echo "Upload archive contains an unsafe path" >&2
  exit 74
fi
if ! tar --verbose --list --file="$uploads_tar" | \
    awk '
      substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { exit 1 }
      substr($1, 1, 10) ~ /[sStT]/ { exit 1 }
    '; then
  echo "Upload archive contains an unsafe entry type or special mode" >&2
  exit 74
fi
tar --extract --file="$uploads_tar" --directory="$upload_extract_root" \
  --no-same-owner --no-same-permissions
if [[ ! -d $upload_extract_root/uploads || -L $upload_extract_root/uploads ]]; then
  echo "Upload archive did not restore the expected root" >&2
  exit 74
fi
restored_upload_files=$(find -P "$upload_extract_root/uploads" -xdev -type f -printf . | \
  awk '{ total += length } END { print total + 0 }')
restored_upload_bytes=$(find -P "$upload_extract_root/uploads" -xdev -type f -printf '%s\n' | \
  awk '{ total += $1 } END { printf "%.0f\n", total + 0 }')

mariadb -e "CREATE DATABASE \`$drill_database\`
  CHARACTER SET $database_charset COLLATE $database_collation"
drill_created=1
mariadb --default-character-set=utf8mb4 "$drill_database" <"$database_dump"

restored_table_count=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$drill_database' AND TABLE_TYPE='BASE TABLE'")
if [[ $restored_table_count != "$expected_tables" ]]; then
  echo "Restored table count differs from backup metadata" >&2
  exit 1
fi
restored_schema_hash=$(mariadb-dump --no-data --skip-comments --compact \
  --routines --triggers --events "$drill_database" | sha256sum | awk '{print $1}')
if [[ $restored_schema_hash != "$expected_schema_hash" ]]; then
  echo "Restored schema hash differs from backup metadata" >&2
  exit 1
fi
restored_migration_fingerprint=$(mariadb --batch --skip-column-names "$drill_database" -e \
  "SET SESSION group_concat_max_len=1048576;
   SELECT SHA2(GROUP_CONCAT(CONCAT(version, ':', success, ':', HEX(checksum))
     ORDER BY version SEPARATOR '|'), 256) FROM _sqlx_migrations")
if [[ $restored_migration_fingerprint != "$expected_migration_fingerprint" ]]; then
  echo "Restored SQLx migration history differs from backup metadata" >&2
  exit 1
fi
if ! mariadb-check --check "$drill_database" >/dev/null; then
  echo "MariaDB consistency check failed for the restored database" >&2
  exit 1
fi

mapfile -t restored_tables < <(mariadb --batch --skip-column-names -e \
  "SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$drill_database' AND TABLE_TYPE='BASE TABLE'")
restored_rows=0
for table_name in "${restored_tables[@]}"; do
  if [[ ! $table_name =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Unsafe table name returned by MariaDB" >&2
    exit 65
  fi
  table_rows=$(mariadb --batch --skip-column-names -e \
    "SELECT COUNT(*) FROM \`$drill_database\`.\`$table_name\`")
  restored_rows=$((restored_rows + table_rows))
done

mariadb -e "DROP DATABASE \`$drill_database\`"
drill_created=0
completed_epoch=$(date -u +%s)
duration_seconds=$((completed_epoch - started_epoch))

status_temp="$state_root/last-restore-drill.env.$selected_backup"
cat >"$status_temp" <<EOF
BACKUP_ID=$selected_backup
COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DURATION_SECONDS=$duration_seconds
DATABASE_TABLES=$restored_table_count
DATABASE_ROWS=$restored_rows
DATABASE_SCHEMA_SHA256=$restored_schema_hash
SQLX_MIGRATION_FINGERPRINT=$restored_migration_fingerprint
UPLOAD_FILES=$restored_upload_files
UPLOAD_BYTES=$restored_upload_bytes
TEMPORARY_DATABASE_REMOVED=yes
LOCAL_STAGING_REMOVED=on-exit
EOF
chmod 0600 "$status_temp"
mv -fT "$status_temp" "$state_root/last-restore-drill.env"

echo "offsite_restore_drill=passed"
echo "backup_id=$selected_backup"
echo "tables_verified=$restored_table_count"
echo "rows_verified=$restored_rows"
echo "upload_files_verified=$restored_upload_files"
echo "duration_seconds=$duration_seconds"
echo "temporary_database_removed=yes"
echo "local_staging_removed=on-exit"
