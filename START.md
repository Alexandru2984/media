# 🚀 Ghid Rapid de Pornire

## Stack Tehnologic

### Backend (Rust)
- **Framework**: Axum 0.7 (framework web modern de la echipa Tokio)
- **Database**: SQLite cu SQLx (async database driver)
- **Auth**: JWT cu jsonwebtoken + bcrypt pentru parole
- **CORS**: tower-http pentru cross-origin requests

### Frontend (JavaScript)
- **Framework**: Solid.js (framework reactiv similar cu React dar mai rapid)
- **Build Tool**: Vite
- **Routing**: @solidjs/router
- **State Management**: Signals (built-in în Solid.js)

## Pornire Rapidă

### 1. Backend (Terminal 1)

```bash
cd backend
cargo run
```

Serverul va rula pe: **http://localhost:8080**

Primul build va dura câteva minute pentru a descărca și compila dependențele.

### 2. Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Aplicația va rula pe: **http://localhost:3000**

## API Endpoints

Toate endpoint-urile încep cu `/api`:

### Autentificare
- `POST /api/auth/register` - Înregistrare
  ```json
  {
    "username": "john",
    "email": "john@example.com",
    "password": "secret123",
    "bio": "Hello world!" (opțional)
  }
  ```

- `POST /api/auth/login` - Login
  ```json
  {
    "email": "john@example.com",
    "password": "secret123"
  }
  ```

### Postări
- `GET /api/posts?limit=10&offset=0` - Lista postări (necesită autentificare)
- `POST /api/posts` - Creează postare (necesită autentificare)
  ```json
  {
    "content": "Prima mea postare!",
    "image_url": "https://..." (opțional)
  }
  ```
- `POST /api/posts/:id/like` - Like/Unlike (necesită autentificare)

### Comentarii
- `GET /api/posts/:id/comments` - Obține comentarii
- `POST /api/posts/:id/comments` - Adaugă comentariu
  ```json
  {
    "content": "Comentariu frumos!"
  }
  ```

### Utilizatori
- `GET /api/users/:id` - Profilul unui utilizator

## Autentificare

Backend-ul folosește **JWT (JSON Web Tokens)**. După login/register, primești un token care trebuie trimis în header:

```
Authorization: Bearer <token>
```

Token-ul este valid 7 zile și este stocat automat în localStorage de către frontend.

## Structura Proiectului

```
social-media-app/
├── backend/               # Rust + Axum
│   ├── src/
│   │   ├── main.rs       # Entry point, setup server
│   │   ├── routes.rs     # API routes
│   │   ├── handlers.rs   # Request handlers
│   │   ├── models.rs     # Data models
│   │   ├── database.rs   # Database connection
│   │   └── auth.rs       # JWT logic
│   ├── migrations/       # SQL migrations
│   └── Cargo.toml        # Rust dependencies
│
└── frontend/             # Solid.js + Vite
    ├── src/
    │   ├── index.jsx     # Entry point, routing
    │   ├── api.js        # API client
    │   ├── AuthContext.jsx  # Auth state management
    │   ├── components/   # UI components
    │   │   ├── Navbar.jsx
    │   │   ├── PostCard.jsx
    │   │   └── CreatePost.jsx
    │   └── pages/        # Page components
    │       ├── Home.jsx
    │       ├── Login.jsx
    │       └── Register.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json

```

## Funcționalități

✅ Înregistrare și autentificare utilizatori
✅ Creare postări
✅ Like/Unlike postări
✅ Comentarii la postări
✅ Feed cu toate postările
✅ Profile utilizatori
✅ Interface modernă și responsive

## De Reținut

1. **Backend pornește pe portul 8080** și acceptă request-uri de la orice origine (CORS permissive)
2. **Frontend pornește pe portul 3000** și face request-uri către backend
3. **Baza de date SQLite** se creează automat la primul run (`social_media.db`)
4. **JWT secret** trebuie schimbat în producție (vezi `backend/src/auth.rs`)

## Depanare

### Backend nu pornește?
- Verifică că ai Rust instalat: `rustc --version`
- Instalează Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Frontend nu pornește?
- Verifică că ai Node.js instalat: `node --version`
- Rulează: `npm install` în directorul frontend

### Erori CORS?
- Verifică că backend-ul rulează pe port 8080
- Verifică că frontend-ul face request-uri la `http://localhost:8080`

## Next Steps

Funcționalități care pot fi adăugate:
- 📸 Upload imagini (cu multer sau similar)
- 👥 Sistem de follow/unfollow
- 🔔 Notificări în timp real (WebSockets)
- 🔍 Căutare utilizatori și postări
- ✏️ Edit/Delete pentru postări proprii
- 📱 Avatar upload pentru profile
- 🌙 Dark mode
- ♾️ Infinite scroll pentru feed