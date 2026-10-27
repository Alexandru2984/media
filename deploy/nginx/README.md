# Nginx deployment

Repository files map to the host as follows:

```text
conf.d/media-rate-limit.conf
  -> /etc/nginx/conf.d/media-rate-limit.conf
snippets/media-api-proxy.conf
  -> /etc/nginx/snippets/media-api-proxy.conf
snippets/media-security-headers.conf
  -> /etc/nginx/snippets/media-security-headers.conf
sites-available/media.micutu.com
  -> /etc/nginx/sites-available/media.micutu.com
```

The vhost depends on the host-managed `cloudflare-origin-guard.conf`,
`cloudflare-realip.conf`, and `block-dotfiles.conf` files. It must not be enabled
on a host without those dependencies.

## Validation and rollout

1. Back up every existing target file outside the repository.
2. Install the files as root with mode `0644` and owner `root:root`.
3. Run `nginx -t`; restore the backups immediately on failure.
4. Reload, do not restart, Nginx.
5. Verify the homepage, API, assets, sensitive-route cache policy, CORS removal,
   direct-origin rejection, upload response headers, and rate-limit status.
6. Keep the backup until logs and application behavior have been reviewed.

Do not edit the installed copies independently. Update and validate the tracked
files first so production state remains reviewable and reproducible.
