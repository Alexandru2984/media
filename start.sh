#!/bin/bash

# Script pentru pornirea aplicației de social media

echo "🚀 Pornire aplicație Social Media..."
echo ""

# Verifică dacă Rust este instalat
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust nu este instalat. Instalează Rust de la https://rustup.rs/"
    exit 1
fi

# Verifică dacă Node.js este instalat
if ! command -v npm &> /dev/null; then
    echo "❌ Node.js nu este instalat. Instalează Node.js de la https://nodejs.org/"
    exit 1
fi

echo "✅ Toate dependențele necesare sunt instalate"
echo ""

# Pornește backend-ul
echo "🔧 Pornire backend Rust..."
cd backend
cargo build --release 2>&1 | grep -E "Finished|error" &
BACKEND_PID=$!

# Așteaptă câteva secunde pentru build
sleep 5

# Pornește backend-ul
cargo run --release &
CARGO_PID=$!

cd ..

# Așteaptă ca backend-ul să pornească
sleep 3

# Pornește frontend-ul
echo "🎨 Pornire frontend Solid.js..."
cd frontend
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "✨ Aplicația este pornită!"
echo "📱 Frontend: http://localhost:3000"
echo "🔌 Backend: http://localhost:8080"
echo ""
echo "Apasă Ctrl+C pentru a opri aplicația"

# Așteaptă să fie oprite procesele
wait