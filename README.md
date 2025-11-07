# Social Media App

Aplicație de social media construită cu:
- **Backend**: Rust + Axum + SQLite
- **Frontend**: Solid.js + Vite

## Funcționalități

- 🔐 Autentificare (Login/Register)
- 📝 Creare postări
- ❤️ Like la postări
- 💬 Comentarii
- 📱 Interface responsive
- 🔄 Real-time updates

## Pornire Backend (Rust)

1. Navighează în directorul backend:
```bash
cd backend
```

2. Instalează Rust (dacă nu îl ai deja):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

3. Pornește serverul:
```bash
cargo run
```

Serverul va rula pe: `http://localhost:8080`

## Pornire Frontend (Solid.js)

1. Navighează în directorul frontend (într-un terminal nou):
```bash
cd frontend
```

2. Instalează dependențele (dacă nu sunt deja instalate):
```bash
npm install
```

3. Pornește aplicația:
```bash
npm run dev
```

Frontend-ul va rula pe: `http://localhost:3000`

## Structura Bazei de Date

### Users
- id (TEXT, PRIMARY KEY)
- username (TEXT, UNIQUE)
- email (TEXT, UNIQUE)
- password_hash (TEXT)
- bio (TEXT, OPTIONAL)
- avatar_url (TEXT, OPTIONAL)
- created_at, updated_at (DATETIME)

### Posts
- id (TEXT, PRIMARY KEY)
- user_id (TEXT, FOREIGN KEY)
- content (TEXT)
- image_url (TEXT, OPTIONAL)
- likes_count (INTEGER)
- comments_count (INTEGER)
- created_at, updated_at (DATETIME)

### Comments
- id (TEXT, PRIMARY KEY)
- post_id (TEXT, FOREIGN KEY)
- user_id (TEXT, FOREIGN KEY)
- content (TEXT)
- created_at, updated_at (DATETIME)

### Likes
- id (TEXT, PRIMARY KEY)
- post_id (TEXT, FOREIGN KEY)
- user_id (TEXT, FOREIGN KEY)
- created_at (DATETIME)

## API Endpoints

### Autentificare
- `POST /api/auth/register` - Înregistrare utilizator nou
- `POST /api/auth/login` - Login

### Utilizatori
- `GET /api/users/:id` - Obține profilul unui utilizator

### Postări
- `GET /api/posts` - Obține toate postările
- `POST /api/posts` - Creează o postare nouă
- `POST /api/posts/:id/like` - Like/Unlike la o postare

### Comentarii
- `GET /api/posts/:id/comments` - Obține comentariile unei postări
- `POST /api/posts/:id/comments` - Adaugă un comentariu

## Tehnologii Utilizate

### Backend
- **Axum** - Web framework pentru Rust
- **SQLx** - Database toolkit async pentru Rust
- **SQLite** - Bază de date embedded
- **bcrypt** - Hashing pentru parole
- **jsonwebtoken** - Autentificare JWT
- **Tower HTTP** - CORS middleware

### Frontend
- **Solid.js** - Framework UI reactiv
- **Vite** - Build tool
- **@solidjs/router** - Routing

## Notițe de Securitate

⚠️ **IMPORTANT**: Această aplicație este pentru demonstrație. Înainte de a o folosi în producție:

1. Schimbă `JWT_SECRET` din `backend/src/auth.rs` cu o cheie secretă puternică
2. Activează HTTPS
3. Configurează variabile de mediu pentru toate secretele
4. Implementează rate limiting
5. Adaugă validare mai strictă pe backend
6. Implementează sanitizare pentru input-uri

## Dezvoltare Ulterioară

Funcționalități care pot fi adăugate:
- 📸 Upload imagini
- 👥 Sistem de followers/following
- 🔔 Notificări
- 🔍 Căutare utilizatori și postări
- ✏️ Editare/ștergere postări
- 📱 Profile personalizabile
- 🌙 Dark mode
- 📊 Analytics și statistici# Social_media
# social_media
