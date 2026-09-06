# Panduan Deploy GEMAS ke VPS

## Prasyarat VPS
- Node.js 20+ 
- PM2 (`npm install -g pm2`)
- Nginx (opsional, untuk domain + SSL)

## Langkah Deploy

### 1. Clone repo di VPS
```bash
git clone https://github.com/pipi2303-hub/dev-gemas.git
cd dev-gemas
npm install
```

### 2. Buat file .env
```bash
cp .env.example .env
nano .env
```
Isi:
```
TURSO_URL=libsql://gemas-prod-pipi2303-hub.aws-ap-northeast-1.turso.io
TURSO_TOKEN=<token dari: turso db tokens create gemas-prod --expiration none>
JWT_SECRET=<string acak panjang, min 64 karakter>
PORT=3000
CLIENT_ORIGIN=https://yourdomain.com
```

Generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### 3. Build frontend
```bash
npm run build
```

### 4. Jalankan dengan PM2
```bash
pm2 start npm --name "gemas" -- run start
pm2 save
pm2 startup
```

### 5. Nginx config (jika pakai domain)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan SSL dengan Certbot:
```bash
certbot --nginx -d yourdomain.com
```

## Update Aplikasi (via Portainer + GHCR)
Setiap push ke branch `main`, GitHub Actions otomatis:
1. Build image Docker dan push ke `ghcr.io/pipi2303/dev-gemas:latest`
2. Trigger redeploy stack di Portainer (`pullImage: true`) sehingga container menarik image terbaru

Tidak perlu langkah manual di VPS. Pastikan sekali di awal:
- Registry `ghcr.io` sudah ditambahkan di Portainer (Settings → Registries) dengan kredensial GitHub (username + PAT scope `read:packages`), karena image GHCR default-nya private.
- Secrets `PORTAINER_TOKEN`, `PORTAINER_URL`, `PORTAINER_STACK_ID`, `GH_PAT` sudah diset di GitHub repo (Settings → Secrets → Actions).

## Monitoring
```bash
docker logs -f gemas   # lihat logs real-time
docker ps              # status container
```

