# Panduan Deploy GEMAS ke Production

> Dokumen ini menggantikan versi lama yang menjelaskan setup PM2 + Turso --
> setup itu sudah tidak dipakai. Production sekarang jalan lewat **Docker
> Compose + Postgres**, dengan deploy otomatis via **GitHub Actions ->
> GHCR -> Portainer** setiap push ke `main` (lihat `.github/workflows/deploy.yml`
> dan `docker-compose.yml`).

## Arsitektur Singkat

- **`gemas_demo_db`**: container Postgres 16, data persisten di volume
  `gemas_demo_postgres_data`.
- **`gemas_demo`**: container aplikasi (image `ghcr.io/pipi2303/gemas-demo`),
  satu proses Express yang serve API (`/api/*`) dan frontend statis (hasil
  `vite build`) sekaligus -- lihat `server/index.ts`. Terekspos di port host
  `8093` (mapped ke port 3000 di container).
- Backup harian otomatis (terenkripsi AES-256-GCM) ditulis ke volume
  `gemas_demo_backups` (lihat `runBackup()` di `server/index.ts`).

## Setup Awal (sekali saja)

### 1. Portainer
- Tambahkan registry `ghcr.io` di Portainer (Settings -> Registries) dengan
  kredensial GitHub (username + Personal Access Token scope `read:packages`)
  -- image GHCR default-nya private.
- Buat stack di Portainer dari `docker-compose.yml` di repo ini, isi env var
  stack (lihat bagian "Environment Variables" di bawah).
- Catat Stack ID-nya untuk secret `PORTAINER_STACK_ID` di bawah.

### 2. GitHub Secrets (Settings -> Secrets and variables -> Actions)
Wajib diisi supaya `.github/workflows/deploy.yml` bisa jalan:

| Secret | Keterangan |
|---|---|
| `PORTAINER_URL` | URL API Portainer, mis. `https://portainer.contoh.org` |
| `PORTAINER_TOKEN` | API key Portainer (X-API-Key) |
| `PORTAINER_STACK_ID` | ID stack yang dibuat di langkah 1 |
| `GH_PAT` | Personal Access Token GitHub scope `read:packages`, dipakai Portainer untuk pull image GHCR private |
| `STACK_POSTGRES_DB` / `STACK_POSTGRES_USER` / `STACK_POSTGRES_PASSWORD` | Kredensial Postgres, di-inject ke stack saat redeploy |
| `STACK_JWT_SECRET` | Minimal 32 karakter acak -- lihat cara generate di `.env.example` |
| `STACK_CLIENT_ORIGIN` | Domain publik aplikasi, mis. `https://gemas.contoh.org` (dipakai untuk CORS **dan** untuk polling `/api/health` setelah redeploy) |

### 3. Environment Variables (docker-compose.yml)
Lihat `.env.example` untuk penjelasan tiap variable. Yang WAJIB di production:
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET` (>=32
karakter), `CLIENT_ORIGIN`. Semua ini disuplai lewat GitHub Secrets di atas
saat pipeline redeploy -- **bukan** file `.env` yang disimpan manual di server.

## Alur Deploy (otomatis)

Setiap push ke branch `main`, GitHub Actions (`deploy.yml`) berjalan:

1. **Job `test`**: jalankan seluruh suite `npm test` terhadap Postgres asli
   (service container di CI) -- deploy dibatalkan kalau ada test yang gagal.
2. **Job `build`**: build image Docker, push ke
   `ghcr.io/pipi2303/gemas-demo:<commit-sha>`.
3. **Job `deploy`**: trigger redeploy stack di Portainer (`pullImage: true`),
   lalu **poll `${STACK_CLIENT_ORIGIN}/api/health` sampai HTTP 200 atau
   timeout 5 menit** -- kalau container baru gagal naik/sehat, job ini gagal
   dengan jelas alih-alih melapor "sukses" padahal produksi down.

Tidak ada langkah manual di VPS untuk deploy rutin.

## Rollback Manual (kalau health check gagal)

1. Buka Portainer -> stack -> lihat log container `gemas_demo` untuk cari
   penyebab (env var salah, migrasi gagal, dst).
2. Redeploy manual ke image commit SHA sebelumnya yang diketahui sehat
   (Portainer -> stack -> edit image tag ke SHA lama, images selalu di-pin ke
   commit SHA, tidak pernah `latest` -- lihat `deploy.yml`).
3. Setelah stabil, perbaiki root cause lalu push lagi ke `main`.

## Monitoring

```bash
docker logs -f gemas_demo        # log aplikasi real-time
docker logs -f gemas_demo_db     # log Postgres
docker ps                        # status & healthcheck container
curl -sk https://<domain>/api/health   # cek manual endpoint health
```

## Backup & Restore

- Backup otomatis harian (terenkripsi, 7 hari retensi) ada di volume
  `gemas_demo_backups` di dalam container -- salin keluar volume secara
  berkala ke storage lain (belum ada offsite backup otomatis, lihat catatan
  audit production-readiness).
- Backup/restore manual (juga terenkripsi) tersedia lewat menu Admin Sistem ->
  Backup & Restore di aplikasi.
