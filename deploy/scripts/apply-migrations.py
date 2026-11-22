#!/usr/bin/env python3
"""Apply one reviewed additive migration with a verified local backup.

Run with sudo; shares the application deployment lock. Never prints .env values.
Rollback restores the prior compatible API binary, retaining additive columns.
"""
import argparse
import fcntl
import grp
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import urllib.request


def run(command, **options):
    result = subprocess.run(command, capture_output=True, **options)
    if result.returncode:
        raise RuntimeError(f"{command[0]} failed; migration stopped")
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('release_id')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Requires the local MariaDB administrator session')
    if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}', args.release_id):
        raise RuntimeError('Invalid release ID')
    database = os.environ.get('MEDIA_DATABASE_NAME', 'social_media')
    if not re.fullmatch(r'[A-Za-z0-9_]{1,32}', database):
        raise RuntimeError('Invalid expected database name')
    os.umask(0o077)
    root = Path(__file__).resolve().parents[2]
    binary = root / 'backend/target/release/migrate'
    environment = Path(os.environ.get('MEDIA_MIGRATION_ENV_FILE', str(root / 'backend/.env')))
    if binary.is_symlink() or not binary.is_file() or not os.access(binary, os.X_OK):
        raise RuntimeError('Build the migration binary first')
    if environment.is_symlink() or not environment.is_file():
        raise RuntimeError('Missing or unsafe environment file')
    attributes = environment.stat()
    if attributes.st_uid != 0 or attributes.st_gid != 0 or stat.S_IMODE(attributes.st_mode) != 0o600:
        raise RuntimeError('Environment file must be root:root 0600')
    lock_root = Path('/var/lib/media')
    attributes = lock_root.lstat()
    if not stat.S_ISDIR(attributes.st_mode) or attributes.st_uid != 0 or attributes.st_mode & 0o022:
        raise RuntimeError('Unsafe release lock directory')
    descriptor = os.open(lock_root / '.release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('Another Media deployment is active; retry after it completes') from None

    def sql(statement, selected=database):
        return run(['mariadb', '--batch', '--skip-column-names', selected], input=statement.encode()).decode().strip()

    source = []
    for file in sorted((root / 'backend/migrations').glob('*.sql')):
        match = re.fullmatch(r'([0-9]{14})_.+\.sql', file.name)
        if not match or file.is_symlink():
            raise RuntimeError('Unsafe migration source')
        source.append({'version': int(match[1]), 'checksum': hashlib.sha384(file.read_bytes()).hexdigest()})
    if not source or len({row['version'] for row in source}) != len(source):
        raise RuntimeError('Empty or duplicate migration history')
    manifest = json.loads(run([str(binary), 'manifest'], timeout=15))
    if manifest != source:
        raise RuntimeError('Compiled migration manifest differs from reviewed source')

    def applied():
        rows = sql('SELECT version, LOWER(HEX(checksum)), success FROM _sqlx_migrations ORDER BY version')
        result = []
        for line in rows.splitlines():
            version, checksum, success = line.split('\t')
            if success != '1':
                raise RuntimeError('Database has a failed migration')
            result.append({'version': int(version), 'checksum': checksum})
        return result

    installed = applied()
    if installed != source[:len(installed)]:
        raise RuntimeError('Database history is not a verified prefix of source')
    pending = source[len(installed):]
    if len(pending) > 1:
        raise RuntimeError('Apply one reviewed migration at a time')
    print('pending_versions=' + json.dumps([row['version'] for row in pending]), flush=True)
    if args.dry_run or not pending:
        print('dry_run=passed' if args.dry_run else 'migration_state=already_current')
        return
    usage = shutil.disk_usage('/var/backups')
    estimated_size = int(sql("SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()"))
    if usage.free < max(64 * 1024 * 1024, estimated_size * 3):
        raise RuntimeError('Insufficient space for migration backup and verification')
    backup = Path('/var/backups') / f'media-migration-{args.release_id}'
    backup.mkdir(mode=0o700)
    (backup / 'metadata.json').write_text(json.dumps({'database': database, 'release_id': args.release_id, 'pending': pending, 'migration_binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}, indent=2) + '\n')
    stage = f'{database}_migration_check_{secrets.token_hex(4)}'
    stage_created = False
    try:
        tables = sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME").splitlines()
        if not tables or any(not re.fullmatch(r'[A-Za-z0-9_]+', table) for table in tables):
            raise RuntimeError('Unexpected database table name')
        counts = {table: sql(f'SELECT COUNT(*) FROM `{table}`') for table in tables}
        dump = backup / 'database.sql'
        with dump.open('xb') as target:
            result = subprocess.run(['mariadb-dump', '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob', database], stdout=target, stderr=subprocess.PIPE)
            if result.returncode:
                raise RuntimeError('Migration backup failed')
        if not dump.stat().st_size:
            raise RuntimeError('Migration backup is empty')
        sql(f'CREATE DATABASE `{stage}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
        stage_created = True
        with dump.open('rb') as data:
            result = subprocess.run(['mariadb', stage], stdin=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode:
                raise RuntimeError('Migration backup restore verification failed')
        if any(sql(f'SELECT COUNT(*) FROM `{table}`', stage) != count for table, count in counts.items()):
            raise RuntimeError('Restored backup row counts differ; source may have changed, retry')
        run(['mariadb-check', '--check', '--databases', stage])
        restored = sql('SELECT version, LOWER(HEX(checksum)), success FROM _sqlx_migrations ORDER BY version', stage)
        if restored != sql('SELECT version, LOWER(HEX(checksum)), success FROM _sqlx_migrations ORDER BY version'):
            raise RuntimeError('Restored migration history differs')
        compressed = backup / 'database.sql.gz'
        with dump.open('rb') as data, compressed.open('xb') as target, gzip.GzipFile(fileobj=target, mode='wb') as archive:
            shutil.copyfileobj(data, archive)
        # Reading the compressed copy verifies its CRC before removing plaintext.
        with gzip.open(compressed, 'rb') as restored_data:
            digest = hashlib.file_digest(restored_data, 'sha256').hexdigest()
        if digest != hashlib.sha256(dump.read_bytes()).hexdigest():
            raise RuntimeError('Compressed backup integrity failed')
        dump.unlink()
        (backup / 'SHA256SUMS').write_text(hashlib.sha256(compressed.read_bytes()).hexdigest() + '  database.sql.gz\n')
        print(f'backup_restore=passed; tables={len(tables)}; backup={backup}', flush=True)
    finally:
        if stage_created and stage.startswith(database + '_migration_check_') and stage != database:
            sql(f'DROP DATABASE `{stage}`')

    candidates = lock_root / 'migration-candidates'
    candidates.mkdir(mode=0o750, exist_ok=True)
    if candidates.is_symlink() or candidates.stat().st_uid != 0 or candidates.stat().st_mode & 0o022:
        raise RuntimeError('Unsafe migration candidate directory')
    os.chown(candidates, 0, grp.getgrnam('www-data').gr_gid)
    candidates.chmod(0o750)
    target = candidates / f'migrate-{args.release_id}'
    if target.exists() or target.is_symlink():
        raise RuntimeError('Migration candidate already exists')
    with binary.open('rb') as data, target.open('xb') as output:
        shutil.copyfileobj(data, output)
    os.chown(target, 0, grp.getgrnam('www-data').gr_gid)
    target.chmod(0o750)
    if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(binary.read_bytes()).digest():
        raise RuntimeError('Migration binary integrity failed')
    command = ['systemd-run', f'--unit=media-migrate-{args.release_id}', '--wait', '--pipe', '--collect',
               '--uid=www-data', '--gid=www-data', f'--working-directory={root / "backend"}',
               f'--property=EnvironmentFile={environment}', '--property=NoNewPrivileges=yes',
               '--property=PrivateTmp=yes', '--property=ProtectSystem=strict', '--property=ProtectHome=yes',
               '--property=MemoryMax=256M', '--property=RuntimeMaxSec=60s', '--property=TimeoutStopSec=10s',
               str(target), 'apply', database]
    result = subprocess.run(command, capture_output=True, timeout=80)
    (backup / 'migration.log').write_bytes(result.stdout + result.stderr)
    if result.returncode or applied() != source:
        raise RuntimeError(f'Migration failed; backup and protected log retained at {backup}')
    with urllib.request.urlopen('http://127.0.0.1:8083/api/health/ready', timeout=5) as response:
        if response.status != 200:
            raise RuntimeError('API readiness failed after migration')
    print(f'migration_application=passed; version={pending[0]["version"]}; api_ready=passed')
    os.close(descriptor)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error)) from None
