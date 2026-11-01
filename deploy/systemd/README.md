# systemd deployment

The tracked unit maps to:

```text
social-media.service -> /etc/systemd/system/social-media.service
social-media-backup.service -> /etc/systemd/system/social-media-backup.service
social-media-backup.timer -> /etc/systemd/system/social-media-backup.timer
social-media-restore-drill.service -> /etc/systemd/system/social-media-restore-drill.service
social-media-restore-drill.timer -> /etc/systemd/system/social-media-restore-drill.timer
```

The service intentionally writes only to
`/var/www/media.micutu.com/backend/uploads`. Before rollout, that directory and
its descendants must be owned by `www-data:www-data`; use mode `0750` for
directories and `0640` for files. The environment file remains root-readable by
systemd, is deployed as `root:root` with mode `0600`, and must never be
committed. The service process receives the parsed environment from systemd and
does not need read access to the file itself.

## Validation and rollout

1. Save the current unit and an ownership/mode manifest for the upload tree.
2. Run `systemd-analyze verify` and review `systemd-analyze security`.
3. Install the unit as `root:root` with mode `0644`.
4. Run `systemctl daemon-reload`, restart the service, and wait for `active`.
5. Verify `http://127.0.0.1:8083/api/posts`, the public API, SMTP-dependent
   behavior when safe, and write access as the service user.
6. Inspect the journal for sandbox denials and application errors.
7. Restore the previous unit and ownership manifest if any required behavior
   fails.

Hardening should remain explicit. Do not remove a sandbox control to mask a
failure without first identifying the exact required resource or syscall.

The backup unit is root-only because it needs the local MariaDB administrative
socket and read access to the `www-data` upload tree. Its capability set is
bounded to `CAP_DAC_READ_SEARCH`, its filesystem writes are limited to the
dedicated staging, systemd state/runtime, and rclone-token directories, and its
rclone config contains only the Google Drive plus crypt remotes. Install it through
`deploy/scripts/install-offsite-backups.sh`; do not point a root timer at a
user-writable rclone configuration.

The restore drill has the same sandbox and shares the backup operation lock. It
can create and remove only its generated `social_media_offsite_drill_*` database;
it never accepts an operator-provided database name.
