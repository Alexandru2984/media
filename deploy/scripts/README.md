# Release automation

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
