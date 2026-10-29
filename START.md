# Ghid rapid de dezvoltare

## Stack

- Backend: Rust, Axum 0.7, SQLx 0.9 și MySQL
- Frontend: Solid.js, Vite și routerul Solid
- Autentificare: sesiuni opace revocabile, cookie HttpOnly și parole bcrypt
- Producție: Cloudflare Tunnel, Nginx și serviciu systemd izolat

## Configurare locală

1. Creează o bază MySQL goală și un utilizator dedicat.
2. Copiază `backend/.env.example` în `backend/.env` și înlocuiește toate
   valorile demonstrative. Nu copia secretele de producție.
3. Păstrează backendul și frontendul pe loopback. Configurația Vite face proxy
   pentru `/api` și `/uploads` către API.

Backend:

```bash
cargo run --manifest-path backend/Cargo.toml
```

La pornire, SQLx aplică migrațiile versionate din `backend/migrations` și API-ul
ascultă implicit pe `http://127.0.0.1:8083`.

Frontend, din alt terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite ascultă strict pe `http://127.0.0.1:3005`.

## Verificări înainte de commit

```bash
cargo fmt --check --manifest-path backend/Cargo.toml
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock
cd frontend
npm audit --audit-level=low
npm run build
```

Outputul frontend este generat în `frontend/dist` și nu se comite.

## Autentificare

Loginul și înregistrarea setează cookie-ul de sesiune. În producție acesta se
numește `__Host-media_session` și are `Secure`, `HttpOnly`, `SameSite=Strict`,
`Path=/` și expirare absolută de șapte zile. Browserul îl trimite automat;
aplicația nu acceptă `Authorization: Bearer` și nu păstrează credentiale în
`localStorage`.

În baza de date se stochează numai hashul SHA-256 al tokenului aleator. Logoutul
revocă sesiunea curentă. Schimbarea sau resetarea parolei și confirmarea unei noi
adrese de email revocă sesiunile existente. O sesiune expiră după 24 de ore de
inactivitate sau după maximum șapte zile.

Requesturile nesigure (`POST`, `PUT`, `DELETE`) trebuie să aibă exact originea
configurată în `CORS_ORIGIN`. Clienții de dezvoltare trebuie să folosească proxy-ul
Vite sau să trimită originea locală configurată.

## Endpointuri principale

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/me`, `GET|DELETE /api/auth/sessions`
- `DELETE /api/auth/sessions/:id`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET /api/posts`, `POST /api/posts`, `PUT|DELETE /api/posts/:id`
- `POST /api/posts/:id/like`
- `GET|POST /api/posts/:id/comments`, `PUT|DELETE /api/comments/:id`
- `GET /api/search?q=...`
- `GET /api/users/:id`, `PUT /api/users/me/profile`
- `GET /api/notifications`, `GET /api/notifications/unread-count`
- `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`
- `DELETE /api/notifications/:id`
- `POST /api/users/me/avatar`, `POST /api/posts/upload-image`
- `GET|POST /api/messages`
- `GET /api/health/live`, `GET /api/health/ready`

Parolele trebuie să aibă minimum 12 caractere și maximum 72 de octeți.
Conținutul și uploadurile au limite validate din nou în backend.

## Structură

```text
backend/
  migrations/  migrații MySQL încorporate în binar
  src/         API, autentificare, email, validare și securitate
frontend/
  app/src/     componentele și paginile Solid.js
  public/      icon, manifest, robots și sitemap
  dist/        output generat și ignorat de Git
deploy/
  nginx/       vhost și politici de securitate/rate limiting
  systemd/     unitatea izolată a API-ului
docs/          auditul viu și roadmapul
```

Pentru producție și rollback folosește [DEPLOYMENT.md](DEPLOYMENT.md), nu serverul
Vite și nu un binar pornit manual.
