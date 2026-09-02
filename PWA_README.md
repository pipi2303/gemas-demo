# Progressive Web App (PWA) - GPIB Bahtera Kasih

Aplikasi GEMAS GPIB Bahtera Kasih telah dikonfigurasi sebagai **Progressive Web App (PWA)** yang dapat diinstall di berbagai perangkat.

## ⚠️ Important Note

PWA features are **disabled in development mode** to avoid conflicts with Figma preview environment. PWA will be **fully functional in production** after deployment to HTTPS.

To test PWA features:
1. Build for production: `npm run build`
2. Preview locally: `npm run preview`
3. Or deploy to HTTPS hosting (Vercel, Netlify, etc.)

## ✨ Fitur PWA

### 1. **Installable**
- Aplikasi dapat diinstall di perangkat desktop dan mobile
- Tampil seperti aplikasi native dengan icon di home screen
- Berjalan dalam mode standalone (tanpa browser toolbar)

### 2. **Offline Capable**
- Service Worker yang di-cache untuk akses offline
- Data tersimpan secara lokal untuk performa lebih cepat
- Indikator status offline otomatis

### 3. **Auto-Update**
- Aplikasi otomatis update ke versi terbaru
- Notifikasi jika ada update tersedia
- Seamless update tanpa mengganggu user experience

### 4. **Push Notifications** (Coming Soon)
- Notifikasi real-time untuk:
  - Pengumuman gereja
  - Reminder kegiatan
  - Notifikasi permohonan doa
  - Update jadwal ibadah

### 5. **Fast Loading**
- Caching strategi optimal
- Pre-caching asset penting
- Runtime caching untuk fonts dan images

### 6. **Responsive**
- Optimized untuk semua ukuran layar
- Portrait dan landscape orientation support
- Touch-friendly interface

## 📱 Cara Install

### Desktop (Chrome, Edge, Opera)
1. Buka aplikasi di browser
2. Klik icon **Install** (+) di address bar, atau
3. Menu (⋮) → Install Bahtera Kasih
4. Aplikasi akan muncul sebagai desktop app

### Android
1. Buka aplikasi di Chrome/Firefox
2. Tap "Add to Home Screen" dari browser menu
3. Ikuti prompt untuk install
4. Icon akan muncul di home screen

### iOS (Safari)
1. Buka aplikasi di Safari
2. Tap tombol Share (⬆️)
3. Scroll dan pilih "Add to Home Screen"
4. Tap "Add"

## 🔧 Konfigurasi PWA

### File Utama
```
/
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── service-worker.js      # Service worker manual
│   └── icons/                 # App icons (72px to 512px)
├── src/
│   ├── utils/
│   │   └── pwaUtils.ts        # PWA utility functions
│   └── components/
│       └── PWAInstallPrompt.tsx # Install prompt component
└── vite.config.ts             # PWA plugin config
```

### Manifest Configuration
Lokasi: `/public/manifest.json`

```json
{
  "name": "GPIB Bahtera Kasih - GEMAS",
  "short_name": "Bahtera Kasih",
  "theme_color": "#047857",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait-primary",
  "start_url": "/",
  "scope": "/"
}
```

### Service Worker Strategy
- **Cache-First**: Static assets (JS, CSS, images)
- **Network-First**: API calls dan data dinamis
- **Stale-While-Revalidate**: Google Fonts

## 🛠️ Development

### Testing PWA Locally
```bash
# Build production
npm run build

# Preview production build
npm run preview
```

### Chrome DevTools
1. Buka Chrome DevTools (F12)
2. Tab **Application**
3. Check:
   - Manifest
   - Service Workers
   - Cache Storage
   - Offline mode

### Lighthouse Audit
1. Chrome DevTools → Lighthouse
2. Select "Progressive Web App"
3. Generate report
4. Target: Score > 90

## 📊 PWA Checklist

✅ HTTPS enabled (requirement untuk PWA)
✅ Manifest.json dengan metadata lengkap
✅ Service Worker registered
✅ Icons tersedia (72px - 512px)
✅ Offline fallback
✅ Cache strategy implemented
✅ Install prompt custom UI
✅ Theme color configured
✅ Viewport meta tag
✅ Fast loading (<3s)

## 🎨 Icons Required

Pastikan semua icon tersedia di `/public/icons/`:

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png (minimum untuk Android)
- icon-384x384.png
- icon-512x512.png (recommended untuk splash screen)

### Generate Icons
Gunakan tools seperti:
- [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- [PWA Icon Generator](https://tools.crawlink.com/tools/pwa-icon-generator/)

## 🔐 Security

### HTTPS Requirement
PWA **wajib** dijalankan di HTTPS kecuali:
- `localhost` untuk development
- IP `127.0.0.1` untuk testing

### Permissions
PWA dapat meminta permission untuk:
- ✅ Notifications (implemented)
- ✅ Offline storage (implemented)
- ⏳ Location (coming soon)
- ⏳ Camera (coming soon)
- ⏳ Background sync (coming soon)

## 📈 Performance

### Caching Strategy
```javascript
// Static assets - Cache First
globPatterns: ['**/*.{js,css,html,png,svg,woff2}']

// Google Fonts - Cache First with 1 year expiration
runtimeCaching: [
  { urlPattern: /^https:\/\/fonts\.googleapis\.com/ }
]
```

### Bundle Size
- Menggunakan code splitting
- Lazy loading untuk routes
- Tree shaking untuk dependencies
- Compression dengan gzip/brotli

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Auto-deploy dari Git
vercel --prod
```

### Manual Build
```bash
npm run build
# Upload folder /dist ke hosting
```

### Environment Variables
Tidak ada environment variables required untuk basic PWA functionality.

## 🐛 Troubleshooting

### Service Worker Not Registered
- Pastikan HTTPS enabled
- Clear browser cache dan reload
- Check browser console untuk error

### Install Prompt Tidak Muncul
- Pastikan PWA criteria terpenuhi (Lighthouse audit)
- Browser sudah support (Chrome, Edge, Samsung Internet)
- Sudah ditambahkan sebelumnya (cek chrome://apps)

### Offline Mode Tidak Berfungsi
- Check Service Worker status di DevTools
- Verify cache strategy
- Test dengan DevTools offline mode

### Icons Tidak Muncul
- Pastikan path correct di manifest.json
- Icons harus square dan PNG format
- Minimum 192x192px untuk Android

## 📚 Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

## 🎯 Roadmap

- [ ] Background sync untuk offline data
- [ ] Push notifications integration
- [ ] Geolocation for sector mapping
- [ ] QR code scanner untuk offerings
- [ ] Biometric authentication
- [ ] Share API integration
- [ ] App shortcuts
- [ ] Media handling

## 📞 Support

Untuk pertanyaan atau issue terkait PWA, silakan hubungi tim development atau buat issue di repository.

---

**Version**: 1.0.0  
**Last Updated**: February 6, 2026  
**Status**: ✅ Production Ready