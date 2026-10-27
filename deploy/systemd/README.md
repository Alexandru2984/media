# systemd deployment

The tracked unit maps to:

```text
social-media.service -> /etc/systemd/system/social-media.service
```

The service intentionally writes only to
`/var/www/media.micutu.com/backend/uploads`. Before rollout, that directory and
its descendants must be owned by `www-data:www-data`; use mode `0750` for
directories and `0640` for files. The environment file remains root-readable by
systemd and must never be committed.

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
