# 🚀 Deploy pe VPS - media.micutu.com

## Pregătire VPS (Ubuntu 22.04/24.04)

### 1. Conectare la VPS
```bash
ssh root@your-vps-ip
```

### 2. Instalare dependențe
```bash
# Update system
apt update && apt upgrade -y

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install MySQL
apt install -y mysql-server
systemctl start mysql
systemctl enable mysql

# Install Nginx
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# Install Certbot pentru SSL
apt install -y certbot python3-certbot-nginx

# Install Git
apt install -y git
```

### 3. Configurare MySQL
```bash
mysql_secure_installation

# Creează database și user
mysql -u root -p
```

În MySQL console:
```sql
CREATE DATABASE social_media CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'socialmedia'@'localhost' IDENTIFIED BY 'parola-sigura-schimba-asta';
GRANT ALL PRIVILEGES ON social_media.* TO 'socialmedia'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Clonare repository
```bash
cd /var/www
git clone https://github.com/Alexandru2984/social_media.git
cd social_media
```

### 5. Configurare Backend
```bash
cd backend

# Creează .env
cat > .env << 'EOF'
DATABASE_URL=mysql://socialmedia:parola-sigura-schimba-asta@localhost/social_media
JWT_SECRET=$(openssl rand -base64 32)
SERVER_HOST=0.0.0.0
SERVER_PORT=8082
CORS_ORIGIN=https://media.micutu.com

# Email config (opțional - pentru password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@micutu.com
EOF

# Build backend
cargo build --release

# Creează directoare pentru uploads
mkdir -p uploads/avatars uploads/posts
chmod 755 uploads uploads/avatars uploads/posts
```

### 6. Configurare Frontend
```bash
cd ../frontend

# Install dependencies
npm install

# Build pentru production
npm run build
```

### 7. Configurare Nginx
```bash
cat > /etc/nginx/sites-available/media.micutu.com << 'EOF'
server {
    listen 80;
    server_name media.micutu.com;

    # Frontend - servește fișierele statice
    root /var/www/social_media/frontend/dist;
    index index.html;

    # Redirect toate request-urile la index.html pentru SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Backend - reverse proxy
    location /api {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Upload files (avatare și imagini din postări)
    location /uploads {
        alias /var/www/social_media/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;
}
EOF

# Activează site-ul
ln -s /etc/nginx/sites-available/media.micutu.com /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Șterge site-ul default

# Testează configurația
nginx -t

# Restart Nginx
systemctl restart nginx
```

### 8. SSL Certificate (Let's Encrypt)
```bash
certbot --nginx -d media.micutu.com
# Urmează instrucțiunile (introdu email-ul tău)
```

### 9. Creează Systemd Service pentru Backend
```bash
cat > /etc/systemd/system/social-media-backend.service << 'EOF'
[Unit]
Description=Social Media Backend
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/social_media/backend
Environment="RUST_LOG=info"
ExecStart=/var/www/social_media/backend/target/release/social-media-backend
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Setează permisiuni
chown -R www-data:www-data /var/www/social_media
chmod +x /var/www/social_media/backend/target/release/social-media-backend

# Pornește serviciul
systemctl daemon-reload
systemctl start social-media-backend
systemctl enable social-media-backend

# Verifică status
systemctl status social-media-backend
```

### 10. Verificare
```bash
# Verifică logs backend
journalctl -u social-media-backend -f

# Verifică Nginx
systemctl status nginx

# Test API
curl http://localhost:8082/api/posts
```

## 🔄 Update Aplicație (după git push)

```bash
cd /var/www/social_media

# Pull latest changes
git pull origin main

# Update Backend
cd backend
cargo build --release
systemctl restart social-media-backend

# Update Frontend
cd ../frontend
npm install  # dacă sunt dependențe noi
npm run build

# Restart Nginx (dacă e nevoie)
systemctl restart nginx
```

## 📊 Monitoring

```bash
# Vezi logs backend live
journalctl -u social-media-backend -f

# Vezi logs Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Verifică status
systemctl status social-media-backend nginx mysql
```

## 🔒 Securitate

```bash
# Firewall - permite doar HTTP, HTTPS, SSH
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Configurare fail2ban (opțional)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

## 🗄️ Backup Database

```bash
# Backup manual
mysqldump -u socialmedia -p social_media > backup_$(date +%Y%m%d).sql

# Backup automat (cron job)
crontab -e
# Adaugă linia:
0 2 * * * mysqldump -u socialmedia -p'parola' social_media > /root/backups/social_media_$(date +\%Y\%m\%d).sql
```

## 🆘 Troubleshooting

### Backend nu pornește
```bash
# Verifică logs
journalctl -u social-media-backend -n 50

# Verifică MySQL
systemctl status mysql
mysql -u socialmedia -p -e "USE social_media; SHOW TABLES;"

# Verifică port
netstat -tlnp | grep 8082
```

### Frontend nu se încarcă
```bash
# Verifică Nginx
nginx -t
systemctl status nginx

# Verifică fișiere
ls -la /var/www/social_media/frontend/dist/
```

### SSL nu funcționează
```bash
# Reînnoiește certificatul
certbot renew --dry-run
certbot renew
```

## 📝 DNS Settings

În panoul tău de DNS (Cloudflare/etc):
```
Type: A
Name: media
Content: YOUR_VPS_IP
Proxy: Enabled (orange cloud)
```

Sau fără Cloudflare:
```
Type: A
Name: media
Content: YOUR_VPS_IP
TTL: Auto
```

Așteaptă 5-15 minute pentru propagarea DNS!

## ✅ Checklist Final

- [ ] MySQL instalat și configurat
- [ ] Database social_media creată
- [ ] Backend compilat și pornit ca service
- [ ] Frontend build-uit în dist/
- [ ] Nginx configurat corect
- [ ] SSL certificate instalat
- [ ] DNS pointează la VPS
- [ ] Firewall configurat
- [ ] Backup-uri configurate
- [ ] Test complet: https://media.micutu.com

---

**Site-ul tău va fi live la:** https://media.micutu.com 🎉
