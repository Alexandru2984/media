# Deploy și rollback — media.micutu.com

Acest document descrie topologia actuală. Fișierele din `deploy/nginx` și
`deploy/systemd` sunt sursa versionată; configurația live trebuie comparată cu
ele înainte de orice modificare.

## Topologie

```text
Browser -> Cloudflare -> Cloudflare Tunnel -> Nginx pe loopback
                                      |-> release frontend imutabil
                                      `-> 127.0.0.1:8083 -> API Rust -> MySQL
```

- Repository: `/var/www/media.micutu.com`
- Frontend activ: symlinkul `/var/lib/media/frontend-current`
- API activ: `/var/www/media.micutu.com/backend/social-media-backend`
- Uploaduri persistente: `/var/www/media.micutu.com/backend/uploads`
- Servicii: `social-media`, `nginx`, `cloudflared`, `mysql`

Nici API-ul, nici serverul Vite nu trebuie expuse public. Tunelul Cloudflare se
conectează la vhostul Nginx; Nginx rămâne punctul unic pentru antete, limite,
cache, uploaduri și proxy API.

## Configurare

Copiază `backend/.env.example` ca `backend/.env`, cu permisiuni restrictive, și
configurează:

- `DATABASE_URL` pentru un utilizator MySQL dedicat;
- `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL`;
- `APP_URL_LOCAL` și `APP_URL_PRODUCTION` (`https` obligatoriu în producție);
- `ENVIRONMENT=production`;
- `SERVER_HOST=127.0.0.1`, `SERVER_PORT=8083`;
- `CORS_ORIGIN=https://media.micutu.com`.

Nu mai există `JWT_SECRET`: autentificarea folosește tokenuri aleatoare opace,
iar baza stochează numai hashurile lor. Nu păstra credentiale, dumpuri, chei sau
uploaduri reale în Git.

## Baza de date și migrații

Schema trebuie să fie `utf8mb4`. SQLx încorporează migrațiile din
`backend/migrations`, le verifică prin checksum și le înregistrează în
`_sqlx_migrations` la pornirea candidatului.

Înainte de o migrare live:

1. rulează migrarea de două ori într-o bază temporară goală;
2. creează un dump `--single-transaction`, root-only, și calculează SHA-256;
3. pornește candidatul pe un port canary separat;
4. verifică `_sqlx_migrations`, schema, numărul de rânduri și health checks;
5. promovează numai dacă rollbackul binarului și restaurarea dumpului sunt clare.

Rolul aplicației are momentan nevoie de DDL pentru migrarea la startup. Separarea
ulterioară într-un job/rol de migrare cu privilegii temporare rămâne obligatorie.

## Build verificabil

Din rădăcina repository-ului:

```bash
cargo fmt --check --manifest-path backend/Cargo.toml
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
cargo build --release --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock

cd frontend
npm ci
npm audit --audit-level=low
npm run build
```

Outputurile sunt `backend/target/release/social-media-backend` și
`frontend/dist`. Nu le comite.

## Canary backend

Păstrează candidatul sub un nume ce conține commitul, pornește-l ca utilizatorul
`www-data` pe un port loopback diferit și cu același director de lucru. Canary-ul
trebuie să treacă cel puțin:

- `/api/health/live` și `/api/health/ready` -> `200`;
- pornire fără panică și mesajul `database migrations are current`;
- login -> cookie `__Host-media_session` fără token în JSON;
- `/api/auth/me` cu cookie -> `200`;
- logout, apoi refolosirea cookie-ului -> `401`;
- endpointurile JWT/Bearer retrase -> `404`/`401`;
- contul canary și toate rândurile sale eliminate la final.

Pentru export/ștergere, canarul trebuie să includă două conturi și să verifice:

- parola greșită și fraza de confirmare greșită sunt respinse;
- exportul nu conține `password_hash`, `token_hash` sau valori de token;
- like-urile și comentariile șterse corectează contoarele postărilor rămase;
- sesiunile și toate FK-urile utilizatorului dispar după ștergere;
- fișierele owner-bound și rândurile din `upload_deletion_queue` dispar;
- contul martor rămâne intact până la cleanupul explicit al canarului.

Pentru notificări, canarul cu două conturi trebuie să verifice:

- deduplicarea cererilor, aprecierilor și comentariilor repetate;
- respingerea IDOR la citire/ștergere și filtrarea bidirecțională la block;
- eliminarea notificării la anularea acțiunii și cascadele la post/cont;
- contorul necitit, citirea individuală/globală și exportul explicit v4;
- maximum 500 de înregistrări per destinatar și zero rânduri canary la final.

Nu afișa cookie-uri, parole, hashuri, environmentul sau URL-ul bazei în outputul
CI/jurnal.

## Promovare backend

1. Copiază binarul live într-un backup root-only identificat prin timestamp și
   commit; verifică hashul.
2. Instalează candidatul într-un fișier temporar din același filesystem.
3. Înlocuiește atomic binarul live și repornește `social-media`.
4. Dacă restartul sau readiness eșuează, reinstalează imediat backupul și
   repornește serviciul.
5. Compară SHA-256 candidat/live și verifică jurnalul fără a expune secrete.

```bash
systemctl is-active social-media nginx cloudflared
curl -fsS http://127.0.0.1:8083/api/health/live
curl -fsS http://127.0.0.1:8083/api/health/ready
journalctl -u social-media --since '-5 minutes' --no-pager
```

## Promovare frontend

Fiecare bundle intră într-un director nou, root-owned, sub
`/var/lib/media/frontend-releases/<timestamp>-<commit>`. După verificarea
fișierelor, creează un symlink temporar și mută-l atomic peste
`/var/lib/media/frontend-current`. Release-ul precedent rămâne intact pentru
rollback; repository-ul nu este document root.

Testează înainte și după schimbarea symlinkului:

```bash
nginx -t
curl --resolve media.micutu.com:443:127.0.0.1 -fsS https://media.micutu.com/
curl --resolve media.micutu.com:443:127.0.0.1 -fsS https://media.micutu.com/api/health/ready
curl -fsS https://media.micutu.com/
curl -fsS https://media.micutu.com/api/health/ready
```

Primul set verifică Nginx direct pe loopback; al doilea verifică ruta reală prin
Cloudflare Tunnel.

## Rollback

- Backend: reinstalează backupul binar exact al release-ului anterior, repornește
  serviciul și repetă health checks.
- Frontend: mută atomic symlinkul către directorul release anterior; nu reconstrui
  în timpul incidentului.
- Bază de date: migrațiile sunt forward-only. Nu șterge tabele sau coloane pentru
  rollback fără un plan testat; restaurează dumpul pre-migrare dacă schimbarea nu
  este backward-compatible.

Migrarea `upload_deletion_queue` este aditivă și poate rămâne în schemă la un
rollback de binar. Nu șterge manual rândurile `pending`: conțin cleanup fizic
încă datorat. Rândurile `blocked` trebuie investigate individual; workerul nu
execută o cale pe care nu o poate valida.

O migrare backward-compatible poate rămâne în DB când binarul anterior o ignoră.
Documentează explicit această decizie în incident/release notes.

## Verificări de securitate după release

- serviciile `social-media`, `nginx` și `cloudflared` sunt `active`;
- health intern și tunneled sunt `200`;
- `/api/auth/me` fără cookie este `401`;
- răspunsurile API sunt `no-store`, iar asseturile cu hash sunt `immutable`;
- originile străine sunt respinse pentru mutații;
- source maps, `.env`, manifests de build și sursa nu sunt publice;
- userul serviciului poate scrie numai în `backend/uploads`;
- jurnalele conțin path fără query/body/token/email.

Nu folosi `git pull` ca mecanism de rollback și nu construi direct peste binarul
sau release-ul frontend aflat în uz.
