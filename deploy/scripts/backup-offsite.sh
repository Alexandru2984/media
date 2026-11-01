#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly database_name="social_media"
readonly upload_root="/var/www/media.micutu.com/backend/uploads"
readonly rclone_config="/etc/social-media/rclone-backup.conf"
readonly backup_remote="gdrive-vps-crypt:media-social/backups"
readonly backup_root="/var/backups/social-media-offsite"
readonly state_root="/var/lib/social-media-backup"
readonly runtime_root="/run/social-media-backup"
readonly retention_days=35

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
  echo "Off-site backups require the local MariaDB root session" >&2
  exit 77
fi

for command in awk basename cat chmod date dirname find flock grep install \
  mariadb mariadb-dump mktemp mv rclone sha256sum stat tar zstd; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done

if [[ ! -f $rclone_config || -L $rclone_config ]]; then
  echo "Dedicated rclone configuration is missing or unsafe" >&2
  exit 66
fi
if [[ $(stat -c '%U:%G:%a' "$rclone_config") != "root:root:600" ]]; then
  echo "Dedicated rclone configuration must be root:root mode 0600" >&2
  exit 77
fi
if [[ ! -d $upload_root || -L $upload_root ]]; then
  echo "Upload root is missing or unsafe" >&2
  exit 66
fi
if find -P "$upload_root" -xdev -type l -print -quit | grep -q .; then
  echo "Upload root contains a symlink; refusing an ambiguous backup" >&2
  exit 65
fi

source_exists=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$database_name'")
if [[ $source_exists != "1" ]]; then
  echo "Source database does not exist: $database_name" >&2
  exit 66
fi

read -r source_charset source_collation < <(mariadb --batch --skip-column-names -e \
  "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
     FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$database_name'")
if [[ ! $source_charset =~ ^[A-Za-z0-9_]+$ || ! $source_collation =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Unsafe source charset or collation" >&2
  exit 65
fi

source_table_count=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$database_name' AND TABLE_TYPE='BASE TABLE'")
upload_file_count=$(find -P "$upload_root" -xdev -type f -printf . | awk '{ total += length } END { print total + 0 }')
upload_byte_count=$(find -P "$upload_root" -xdev -type f -printf '%s\n' | \
  awk '{ total += $1 } END { printf "%.0f\n", total + 0 }')

# This confirms that the configured backend can decrypt the remote without
# listing account content or exposing configuration values.
rclone --config "$rclone_config" about "gdrive-vps-crypt:" --json >/dev/null

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "database=$database_name"
  echo "tables=$source_table_count"
  echo "upload_files=$upload_file_count"
  echo "upload_bytes=$upload_byte_count"
  echo "remote=$backup_remote"
  echo "retention_days=$retention_days"
  exit 0
fi

install -d -m 0700 "$backup_root" "$state_root" "$runtime_root"
exec 9>"$runtime_root/backup.lock"
if ! flock -n 9; then
  echo "Another social-media backup or restore drill is already running" >&2
  exit 75
fi

backup_id=$(date -u +%Y%m%dT%H%M%SZ)
if [[ ! $backup_id =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Generated backup identifier is invalid" >&2
  exit 65
fi
remote_destination="$backup_remote/$backup_id"
if rclone --config "$rclone_config" lsf "$backup_remote" --dirs-only --max-depth 1 | \
    grep -Fxq "$backup_id/"; then
  echo "Backup destination already exists: $backup_id" >&2
  exit 73
fi

temporary_root=$(mktemp -d -- "$backup_root/run.XXXXXX")
chmod 0700 "$temporary_root"
bundle_root="$temporary_root/bundle"
verify_root="$temporary_root/verify"
install -d -m 0700 "$bundle_root" "$verify_root"
remote_started=0
remote_verified=0

cleanup() {
  local cleanup_status=$?
  if [[ $remote_started -eq 1 && $remote_verified -eq 0 ]]; then
    rclone --config "$rclone_config" purge "$remote_destination" >/dev/null 2>&1 || \
      echo "Failed to remove incomplete remote backup: $backup_id" >&2
  fi
  if [[ -d ${temporary_root:-} ]]; then
    case "$temporary_root" in
      /var/backups/social-media-offsite/run.*)
        find "$temporary_root" -xdev -depth -delete
        ;;
      *) echo "Refusing to remove unexpected temporary path: $temporary_root" >&2 ;;
    esac
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

database_archive="$bundle_root/database.sql.zst"
uploads_archive="$bundle_root/uploads.tar.zst"
schema_file="$temporary_root/schema.sql"

mariadb-dump --single-transaction --quick --hex-blob --routines --triggers \
  --events --skip-comments --default-character-set=utf8mb4 "$database_name" | \
  zstd --quiet -T0 -10 -o "$database_archive"
if [[ ! -s $database_archive || -L $database_archive ]]; then
  echo "Database archive is empty or unsafe" >&2
  exit 74
fi
zstd --quiet --test "$database_archive"

mariadb-dump --no-data --skip-comments --compact --routines --triggers --events \
  "$database_name" >"$schema_file"
source_schema_hash=$(sha256sum -- "$schema_file" | awk '{print $1}')
source_migration_fingerprint=$(mariadb --batch --skip-column-names "$database_name" -e \
  "SET SESSION group_concat_max_len=1048576;
   SELECT SHA2(GROUP_CONCAT(CONCAT(version, ':', success, ':', HEX(checksum))
     ORDER BY version SEPARATOR '|'), 256) FROM _sqlx_migrations")
if [[ -z $source_migration_fingerprint ]]; then
  echo "SQLx migration fingerprint is empty" >&2
  exit 74
fi

tar --create --format=pax --one-file-system --numeric-owner --sort=name \
  --file=- --directory="$(dirname "$upload_root")" "$(basename "$upload_root")" | \
  zstd --quiet -T0 -10 -o "$uploads_archive"
if [[ ! -s $uploads_archive || -L $uploads_archive ]]; then
  echo "Upload archive is empty or unsafe" >&2
  exit 74
fi
zstd --quiet --test "$uploads_archive"

created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat >"$bundle_root/metadata.env" <<EOF
BACKUP_FORMAT_VERSION=1
BACKUP_ID=$backup_id
CREATED_AT=$created_at
DATABASE_NAME=$database_name
DATABASE_CHARSET=$source_charset
DATABASE_COLLATION=$source_collation
DATABASE_TABLES=$source_table_count
DATABASE_SCHEMA_SHA256=$source_schema_hash
SQLX_MIGRATION_FINGERPRINT=$source_migration_fingerprint
UPLOAD_FILES=$upload_file_count
UPLOAD_BYTES=$upload_byte_count
EOF

(
  cd "$bundle_root"
  sha256sum -- database.sql.zst uploads.tar.zst metadata.env >SHA256SUMS
)
chmod 0600 "$bundle_root"/*

remote_started=1
rclone --config "$rclone_config" copy "$bundle_root" "$remote_destination" \
  --immutable --transfers 2 --checkers 4 --retries 3 --low-level-retries 10
rclone --config "$rclone_config" copy "$remote_destination" "$verify_root" \
  --immutable --transfers 2 --checkers 4 --retries 3 --low-level-retries 10

verified_file_count=$(find -P "$verify_root" -mindepth 1 -maxdepth 1 -type f -printf . | \
  awk '{ total += length } END { print total + 0 }')
unexpected_entry=$(find -P "$verify_root" -mindepth 1 -maxdepth 1 ! -type f -print -quit)
if [[ $verified_file_count != "4" || -n $unexpected_entry ]]; then
  echo "Downloaded backup has an unexpected file set" >&2
  exit 74
fi
(
  cd "$verify_root"
  sha256sum --check --strict SHA256SUMS
)
zstd --quiet --test "$verify_root/database.sql.zst" "$verify_root/uploads.tar.zst"
remote_verified=1

database_hash=$(sha256sum -- "$bundle_root/database.sql.zst" | awk '{print $1}')
uploads_hash=$(sha256sum -- "$bundle_root/uploads.tar.zst" | awk '{print $1}')

cutoff_epoch=$(date -u -d "$retention_days days ago" +%s)
pruned_backups=0
mapfile -t remote_directories < <(rclone --config "$rclone_config" \
  lsf "$backup_remote" --dirs-only --max-depth 1)
for remote_directory in "${remote_directories[@]}"; do
  candidate=${remote_directory%/}
  if [[ ! $candidate =~ ^[0-9]{8}T[0-9]{6}Z$ || $candidate == "$backup_id" ]]; then
    continue
  fi
  candidate_timestamp="${candidate:0:4}-${candidate:4:2}-${candidate:6:2} ${candidate:9:2}:${candidate:11:2}:${candidate:13:2} UTC"
  if ! candidate_epoch=$(date -u -d "$candidate_timestamp" +%s); then
    echo "Ignoring an unparseable backup directory: $candidate" >&2
    continue
  fi
  if (( candidate_epoch < cutoff_epoch )); then
    rclone --config "$rclone_config" purge "$backup_remote/$candidate"
    pruned_backups=$((pruned_backups + 1))
  fi
done

status_temp="$state_root/last-success.env.$backup_id"
cat >"$status_temp" <<EOF
BACKUP_ID=$backup_id
COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REMOTE=$remote_destination
DATABASE_ARCHIVE_SHA256=$database_hash
UPLOADS_ARCHIVE_SHA256=$uploads_hash
REMOTE_DOWNLOAD_VERIFIED=yes
RETENTION_DAYS=$retention_days
PRUNED_BACKUPS=$pruned_backups
EOF
chmod 0600 "$status_temp"
mv -fT "$status_temp" "$state_root/last-success.env"

echo "backup=passed"
echo "backup_id=$backup_id"
echo "database_tables=$source_table_count"
echo "upload_files=$upload_file_count"
echo "remote_download_verified=yes"
echo "retention_days=$retention_days"
echo "pruned_backups=$pruned_backups"
