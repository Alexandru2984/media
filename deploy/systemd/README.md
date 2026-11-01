# systemd deployment

The tracked unit maps to:

```text
social-media.service -> /etc/systemd/system/social-media.service
social-media-backup.service -> /etc/systemd/system/social-media-backup.service
social-media-backup.timer -> /etc/systemd/system/social-media-backup.timer
social-media-backup-health.service -> /etc/systemd/system/social-media-backup-health.service
social-media-backup-health.timer -> /etc/systemd/system/social-media-backup-health.timer
social-media-restore-drill.service -> /etc/systemd/system/social-media-restore-drill.service
social-media-restore-drill.timer -> /etc/systemd/system/social-media-restore-drill.timer
social-media-service-health.service -> /etc/systemd/system/social-media-service-health.service
social-media-service-health.timer -> /etc/systemd/system/social-media-service-health.timer
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
socket. It receives the `www-data` supplementary group for read-only upload-tree
access and has an empty capability set. Its filesystem writes are limited to the
dedicated staging, systemd state/runtime, and rclone-token directories, and its
rclone config contains only the Google Drive plus crypt remotes, with Drive
pinned to the encrypted folder ID. Root timers execute only the root-owned copies
under `/usr/local/libexec`, never the user-owned checkout. Install it through
`deploy/scripts/install-offsite-backups.sh`; do not point a root timer at a
user-writable rclone configuration.

The restore drill has the same sandbox and shares the backup operation lock. It
can create and remove only its generated `social_media_offsite_drill_*` database;
it never accepts an operator-provided database name. On systemd 259 the restore
unit intentionally omits `RestrictSUIDSGID`: that control returns `ENOSYS` for
GNU tar's safe `openat2` traversal. The drill compensates by accepting only
regular files/directories without special mode bits, disabling permission/owner
restoration, enforcing `UMask=0077`, and writing only below a root-only path.

Backup, restore, and freshness-check failures use the host's existing
`swift-vapor-alert@.service`. The hourly health unit has no network namespace,
an empty capability set, and read-only access only to root-owned success markers;
it alerts after 30 hours without a verified backup or nine days without a passed
off-site restore drill. Read-only MariaDB and upload-tree inventory also fails on
orphaned, missing, special, symlinked, or structurally unexpected upload files;
the monitor never mutates application data.

`social-media-service-health.timer` runs a separate smoke monitor every five
minutes. Its transient dynamic user can query systemd and make only ordinary
Unix/IPv4/IPv6 connections; it has no credentials, writable application path, or
capabilities. The check covers service state, backend readiness and rejection
boundaries, local Nginx/TLS, and the public Cloudflare Tunnel. Failures use the
same `swift-vapor-alert@.service` path.
