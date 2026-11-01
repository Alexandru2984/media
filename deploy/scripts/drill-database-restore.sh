#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

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
  echo "The restore drill requires the local MariaDB root session" >&2
  exit 77
fi

source_database=${MEDIA_DATABASE_NAME:-social_media}
if [[ ! $source_database =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Invalid source database name" >&2
  exit 64
fi
drill_suffix=$(date -u +%Y%m%d_%H%M%S)
drill_database="${source_database}_restore_drill_${drill_suffix}"
if [[ ! $drill_database =~ ^[A-Za-z0-9_]+$ || $drill_database == "$source_database" ]]; then
  echo "Invalid generated drill database name" >&2
  exit 64
fi

for command in find mariadb mariadb-check mariadb-dump sha256sum; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 69
  fi
done

source_exists=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$source_database'")
if [[ $source_exists != "1" ]]; then
  echo "Source database does not exist: $source_database" >&2
  exit 66
fi
drill_exists=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$drill_database'")
if [[ $drill_exists != "0" ]]; then
  echo "Generated drill database already exists: $drill_database" >&2
  exit 73
fi

read -r source_charset source_collation < <(mariadb --batch --skip-column-names -e \
  "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
     FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$source_database'")
if [[ ! $source_charset =~ ^[A-Za-z0-9_]+$ || ! $source_collation =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Unsafe source charset or collation" >&2
  exit 65
fi
source_table_count=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$source_database' AND TABLE_TYPE='BASE TABLE'")
source_user_count=$(mariadb --batch --skip-column-names "$source_database" \
  -e 'SELECT COUNT(*) FROM users')

if [[ $dry_run -eq 1 ]]; then
  echo "dry_run=passed"
  echo "source_database=$source_database"
  echo "drill_database=$drill_database"
  echo "charset=$source_charset"
  echo "collation=$source_collation"
  echo "tables=$source_table_count"
  echo "users=$source_user_count"
  exit 0
fi

temporary_root=$(mktemp -d -- /var/backups/media-restore-drill.XXXXXX)
chmod 0700 "$temporary_root"
dump_file="$temporary_root/database.sql"
source_schema_file="$temporary_root/source-schema.sql"
restored_schema_file="$temporary_root/restored-schema.sql"
drill_created=0

cleanup() {
  if [[ $drill_created -eq 1 ]]; then
    case "$drill_database" in
      "${source_database}_restore_drill_"*)
        mariadb -e "DROP DATABASE IF EXISTS \`$drill_database\`" >/dev/null 2>&1 || \
          echo "Failed to remove drill database: $drill_database" >&2
        ;;
      *) echo "Refusing to remove unexpected database: $drill_database" >&2 ;;
    esac
  fi
  if [[ -d $temporary_root ]]; then
    case "$temporary_root" in
      /var/backups/media-restore-drill.*) find "$temporary_root" -depth -delete ;;
      *) echo "Refusing to remove unexpected temporary path: $temporary_root" >&2 ;;
    esac
  fi
}
trap cleanup EXIT

mariadb-dump --single-transaction --quick --hex-blob --routines --triggers \
  --events --skip-comments --default-character-set=utf8mb4 \
  "$source_database" >"$dump_file"
if [[ ! -s $dump_file || -L $dump_file ]]; then
  echo "Database dump is empty or unsafe" >&2
  exit 74
fi
chmod 0600 "$dump_file"
dump_hash=$(sha256sum -- "$dump_file" | awk '{print $1}')

mariadb-dump --no-data --skip-comments --compact --routines --triggers --events \
  "$source_database" >"$source_schema_file"
source_schema_hash=$(sha256sum -- "$source_schema_file" | awk '{print $1}')

mariadb -e "CREATE DATABASE \`$drill_database\`
  CHARACTER SET $source_charset COLLATE $source_collation"
drill_created=1
mariadb --default-character-set=utf8mb4 "$drill_database" <"$dump_file"

restored_table_count=$(mariadb --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$drill_database' AND TABLE_TYPE='BASE TABLE'")
if [[ $restored_table_count != "$source_table_count" ]]; then
  echo "Restored table count differs from the source" >&2
  exit 1
fi

mariadb-dump --no-data --skip-comments --compact --routines --triggers --events \
  "$drill_database" >"$restored_schema_file"
restored_schema_hash=$(sha256sum -- "$restored_schema_file" | awk '{print $1}')
if [[ $restored_schema_hash != "$source_schema_hash" ]]; then
  echo "Restored schema hash differs from the source" >&2
  exit 1
fi

mapfile -t source_tables < <(mariadb --batch --skip-column-names -e \
  "SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='$source_database' AND TABLE_TYPE='BASE TABLE'
     ORDER BY TABLE_NAME")
verified_rows=0
for table_name in "${source_tables[@]}"; do
  if [[ ! $table_name =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Unsafe table name returned by MariaDB" >&2
    exit 65
  fi
  source_rows=$(mariadb --batch --skip-column-names -e \
    "SELECT COUNT(*) FROM \`$source_database\`.\`$table_name\`")
  restored_rows=$(mariadb --batch --skip-column-names -e \
    "SELECT COUNT(*) FROM \`$drill_database\`.\`$table_name\`")
  if [[ $restored_rows != "$source_rows" ]]; then
    echo "Row-count mismatch for restored table: $table_name" >&2
    exit 1
  fi
  verified_rows=$((verified_rows + source_rows))
done

source_migration_fingerprint=$(mariadb --batch --skip-column-names "$source_database" -e \
  "SET SESSION group_concat_max_len=1048576;
   SELECT SHA2(GROUP_CONCAT(CONCAT(version, ':', success, ':', HEX(checksum))
     ORDER BY version SEPARATOR '|'), 256) FROM _sqlx_migrations")
restored_migration_fingerprint=$(mariadb --batch --skip-column-names "$drill_database" -e \
  "SET SESSION group_concat_max_len=1048576;
   SELECT SHA2(GROUP_CONCAT(CONCAT(version, ':', success, ':', HEX(checksum))
     ORDER BY version SEPARATOR '|'), 256) FROM _sqlx_migrations")
if [[ -z $source_migration_fingerprint \
      || $restored_migration_fingerprint != "$source_migration_fingerprint" ]]; then
  echo "Restored migration history differs from the source" >&2
  exit 1
fi

if ! mariadb-check --check "$drill_database" >/dev/null; then
  echo "MariaDB consistency check failed for the restored database" >&2
  exit 1
fi

source_schema_after=$(mariadb-dump --no-data --skip-comments --compact \
  --routines --triggers --events "$source_database" | sha256sum | awk '{print $1}')
if [[ $source_schema_after != "$source_schema_hash" ]]; then
  echo "Source schema changed during the restore drill" >&2
  exit 1
fi

mariadb -e "DROP DATABASE \`$drill_database\`"
drill_created=0

echo "restore_drill=passed"
echo "source_database=$source_database"
echo "tables_verified=$source_table_count"
echo "rows_verified=$verified_rows"
echo "dump_sha256=$dump_hash"
echo "schema_sha256=$source_schema_hash"
echo "migration_fingerprint=$source_migration_fingerprint"
echo "temporary_database_removed=yes"
echo "temporary_dump_removed=on-exit"
