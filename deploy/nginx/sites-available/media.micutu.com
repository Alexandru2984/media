server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name media.micutu.com;

    # Reject traffic sent directly to the origin. The variable is derived from
    # the TCP peer before real-IP rewriting and allows Cloudflare plus loopback.
    if ($from_cloudflare_origin = 0) {
        return 403;
    }

    # Serve only an immutable build release. Keeping the repository itself out
    # of the document root prevents manifests, source files, and build config
    # from becoming public after a checkout or source recovery.
    root /var/lib/media/frontend-current;
    index index.html;

    access_log /var/log/nginx/media.access.log;
    error_log /var/log/nginx/media.error.log warn;
    server_tokens off;

    client_max_body_size 64k;
    client_body_timeout 30s;
    client_header_timeout 10s;
    send_timeout 30s;
    limit_conn media_conn 30;
    limit_conn_status 429;
    limit_req_status 429;

    include snippets/block-dotfiles.conf;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location ^~ /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include snippets/media-security-headers.conf;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    # New links keep secrets in URL fragments and exchange them through POST.
    # Logging stays disabled so already-issued query-string links remain safe.
    location ~ ^/(reset-password|verify-email|verify-email-change)/?$ {
        access_log off;
        # Serve the SPA entry in this location instead of internally redirecting
        # to /index.html, which would replace this route's security policy.
        try_files /index.html =404;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    # Private application routes must not enter a search index. Serve the SPA
    # directly so the route keeps this response policy.
    location ~ ^/(login|register|forgot-password|search|profile/[^/]+)/?$ {
        try_files /index.html =404;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    location = /sitemap.xml {
        try_files $uri =404;
        default_type application/xml;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location = /manifest.webmanifest {
        try_files $uri =404;
        default_type application/manifest+json;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location = /robots.txt {
        try_files $uri =404;
        access_log off;
        default_type text/plain;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location = / {
        try_files /index.html =404;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    location ~ ^/(despre|reguli)/?$ {
        try_files /index.html =404;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    # Unknown paths still boot the SPA so client-side navigation can render the
    # branded not-found page, but the HTTP status remains a real 404 for SEO.
    location / {
        try_files $uri $uri/ @spa_not_found;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-cache" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    location @spa_not_found {
        internal;
        error_page 418 =404 /_spa_not_found;
        return 418;
    }

    location = /_spa_not_found {
        internal;
        try_files /index.html =404;
        include snippets/media-security-headers.conf;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    location ~ ^/api/auth/(login|register|session|logout|forgot-password|reset-password|send-verification)$ {
        limit_req zone=media_auth burst=5 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location = /api/auth/verify-email {
        access_log off;
        limit_req zone=media_auth burst=5 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location = /api/users/verify-email-change {
        access_log off;
        limit_req zone=media_auth burst=5 nodelay;
        include snippets/media-api-proxy.conf;
    }

    # Text search is intentionally stricter than ordinary read endpoints because
    # partial matches cannot always use a conventional database index.
    location = /api/search {
        limit_req zone=media_search burst=10 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location = /api/users/me/avatar {
        # Multipart framing must fit in addition to the 5 MiB file itself.
        client_max_body_size 6m;
        limit_req zone=media_upload burst=2 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location = /api/posts/upload-image {
        client_max_body_size 11m;
        limit_req zone=media_upload burst=2 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location /api/ {
        limit_req zone=media_api burst=60 nodelay;
        limit_req zone=media_write burst=15 nodelay;
        include snippets/media-api-proxy.conf;
    }

    location /uploads/ {
        alias /var/www/media.micutu.com/backend/uploads/;
        autoindex off;
        limit_except GET HEAD { deny all; }

        types {
            image/jpeg jpg jpeg;
            image/png png;
            image/webp webp;
        }
        default_type application/octet-stream;

        add_header Cache-Control "public, max-age=2592000, immutable" always;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Permitted-Cross-Domain-Policies "none" always;
    }

    ssl_certificate /etc/letsencrypt/live/media.micutu.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/media.micutu.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    listen 80;
    listen [::]:80;
    server_name media.micutu.com;

    if ($from_cloudflare_origin = 0) {
        return 403;
    }

    include snippets/block-dotfiles.conf;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
