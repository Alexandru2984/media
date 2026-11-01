# Release automation

## Frontend

`deploy-frontend.sh` stages an already validated Vite build under
`/var/lib/media/frontend-releases`, checks its critical hashes and file count,
switches `/var/lib/media/frontend-current` atomically, then runs direct-origin
and Cloudflare Tunnel canaries. Any failed canary restores the exact prior
release. Existing releases are never deleted or pruned automatically.

Build and audit as the ordinary repository user:

```bash
cd /var/www/media.micutu.com/frontend
npm ci
npm run build
npm audit --audit-level=low
```

Create a release ID from the UTC build time and reviewed commit. Validate the
operation without root, then activate the exact same ID:

```bash
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C /var/www/media.micutu.com rev-parse --short HEAD)"
/var/www/media.micutu.com/deploy/scripts/deploy-frontend.sh --dry-run "$release_id"
sudo /var/www/media.micutu.com/deploy/scripts/deploy-frontend.sh "$release_id"
```

Release IDs accept only a strict UTC timestamp plus a 7–40 character lowercase
Git SHA. The deployer refuses source symlinks, an unexpected current target, an
existing destination, a non-root production activation, or mismatched staged
content. It does not build as root, mutate Nginx, restart services, touch the
database, or manage retention. Review and remove old releases separately only
after their rollback value has expired.

## Backend

`deploy-backend.sh` consumes the already validated Cargo release binary. It
requires exact parity between every embedded migration and the live SQLx history;
pending, failed, extra, or reordered migrations stop the deployment and must use
the separately reviewed migration workflow with a database dump.

The script copies an immutable `root:www-data` mode-`0750` candidate under a
non-public root-owned directory, launches it as `www-data` on loopback port
`18084`, and disables only that process's background
upload-maintenance worker. Read-only health, feed, auth-boundary, pagination, and
journal gates run before the live binary is touched. Promotion saves a root-only
rollback binary, replaces the live binary atomically, restarts the API, and runs
direct-origin plus Cloudflare Tunnel canaries. Any failure restores the exact
prior hash and restarts it.

Build and audit without root:

```bash
cd /var/www/media.micutu.com
cargo fmt --check --manifest-path backend/Cargo.toml
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
cargo build --release --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
deploy/scripts/deploy-backend.sh --dry-run "$release_id"
sudo deploy/scripts/deploy-backend.sh "$release_id"
```

The production action requires the root-owned mode-`0600` environment file and
active API, Nginx, and Tunnel services. It never prints configuration or secrets,
does not mutate migrations, and does not delete candidates or backups.

## Database restore drill

`drill-database-restore.sh` takes a transaction-consistent, root-only temporary
dump of the live database and restores it into a uniquely named isolated database.
It compares schema hashes, every base-table row count, the SQLx version/checksum
fingerprint, and `mariadb-check` results. It then drops only the strictly prefixed
temporary database and removes the temporary dump. The source database receives
no DDL or DML.

```bash
sudo deploy/scripts/drill-database-restore.sh --dry-run
sudo deploy/scripts/drill-database-restore.sh
```

The drill intentionally does not create a retained backup. Retention, encryption,
off-host copies, and scheduled production backups require a separately approved
policy and recovery objective.

## Encrypted off-site backup

`backup-offsite.sh` creates a transaction-consistent MariaDB dump and a separate
archive of the managed upload tree. Both are compressed, covered by a SHA-256
manifest, copied only below the versioned
`gdrive-vps-crypt:media-social/backups/<UTC timestamp>` prefix, downloaded again,
and verified before the run can succeed. The script never reads `backend/.env`,
never sends application or SMTP credentials, and never uses `rclone sync`.

Successful backups are retained for 35 days. Pruning runs only after remote
download verification and accepts only directories matching the exact backup ID
format; other crypt-remote directories and other projects are outside its scope.
Local plaintext staging remains root-only and is removed on every exit. A partial
remote upload is purged only from the exact newly generated destination.

The installer copies only the required `gdrive` and `gdrive-vps-crypt` sections
from the operator's mode-`0600` rclone configuration into a dedicated
`root:root`, mode-`0600` file. The copied Drive remote is pinned to the immutable
ID of `VPS-Backups-Encrypted`, while the crypt remote points at that restricted
root. It also installs root-owned executable copies under `/usr/local/libexec`,
so a timer never executes the user-owned checkout directly. It does not print
configuration values and does not start a backup implicitly:

```bash
sudo deploy/scripts/install-offsite-backups.sh --dry-run
sudo deploy/scripts/install-offsite-backups.sh
sudo deploy/scripts/backup-offsite.sh --dry-run
sudo systemctl start social-media-backup.service
sudo systemctl status social-media-backup.service
sudo cat /var/lib/social-media-backup/last-success.env
```

The daily timer runs at 02:42 Europe/Bucharest with up to 20 minutes of jitter.
The rclone crypt password is required after total VPS loss, so keep an offline,
access-controlled recovery copy of that configuration; an encrypted Drive backup
without its crypt material is intentionally unrecoverable.

`drill-offsite-restore.sh` runs weekly against the newest strictly named backup,
or manually against an explicit backup ID. It downloads and verifies the bundle,
validates metadata without sourcing it, rejects unsafe archive paths or entry
types, extracts uploads into root-only temporary storage, and restores MariaDB
only into a generated `social_media_offsite_drill_*` database. Schema SHA-256,
table count, the complete SQLx migration fingerprint, and `mariadb-check` must
pass before that temporary database is dropped. The live database receives no
DDL or DML.

```bash
sudo deploy/scripts/drill-offsite-restore.sh --dry-run
sudo deploy/scripts/drill-offsite-restore.sh
sudo cat /var/lib/social-media-backup/last-restore-drill.env
```

The backup and drill share one non-blocking operation lock, so a long upload can
never overlap a restore exercise. The drill timer runs Sundays at 04:20
Europe/Bucharest with up to 20 minutes of jitter.

Backup and restore unit failures trigger the VPS's existing operator notifier,
which routes to Telegram with email fallback. `check-backup-health.sh` also runs
hourly and fails if the last remotely verified backup is older than 30 hours, the
last successful off-site restore drill is older than nine days, a status marker
is not `root:root 0600`, or cleanup/verification evidence is invalid. Its failure
uses the same notifier, covering disabled or missed timers as well as explicit job
failures. The same read-only check compares physical upload files with every
internal URL referenced by users, posts, managed uploads, and the deletion queue;
orphans, missing files, symlinks, special entries, or unexpected directories
alert but are never deleted automatically. The notifier's own delivery path and
throttling remain managed by the existing host-level
`swift-vapor-alert@.service`.

## Production service monitor

`check-service-health.sh` provides a five-minute production smoke monitor. It
requires all four host services to be active and validates direct API readiness,
anonymous-auth and pagination rejection, the local Nginx/TLS origin, and the
public Cloudflare Tunnel path. Each HTTP boundary receives one bounded retry;
the check sends no credentials, cookies, or request body. It also requires the
origin and edge certificates to remain valid for at least 14 days, root filesystem
and inode usage to stay below 85%, and at least 10 GiB to remain free. Failures
use the same operator notifier:

```bash
sudo deploy/scripts/install-service-health.sh --dry-run
sudo deploy/scripts/install-service-health.sh
sudo systemctl start social-media-service-health.service
journalctl -u social-media-service-health.service -n 30 --no-pager
```

## Exact Cloudflare upload purge

`purge-cloudflare-upload.sh` is an incident/deletion tool for one exact managed
image URL. It accepts only a strict `/uploads/avatars/...` or
`/uploads/posts/...` image path, refuses to continue unless the local TLS origin
already returns `404` with `no-store`, purges only that URL, and then requires a
public `404` without a Cloudflare `HIT`. It never supports hostname, prefix, tag,
or zone-wide purge.

Install the root-owned executable separately:

```bash
sudo deploy/scripts/install-cloudflare-purge.sh --dry-run
sudo deploy/scripts/install-cloudflare-purge.sh
sudo /usr/local/libexec/social-media-purge-upload-cache \
  /uploads/avatars/<managed-image>.webp
```

Provision `/etc/social-media/cloudflare-purge.json` as `root:root 0600`, with
exactly two string fields: `api_token` and `zone_id`. The token must be separate
from analytics/Telegram credentials and have only Cloudflare `Cache Purge`
permission for the one production zone. Never pass it as an argument, environment
variable, repository file, or journal field. A successful API response is not
enough: the script polls the public URL and fails unless edge verification also
passes.
