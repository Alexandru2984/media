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

The script copies an immutable candidate under `/var/lib/media`, launches it as
`www-data` on loopback port `18084`, and disables only that process's background
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
