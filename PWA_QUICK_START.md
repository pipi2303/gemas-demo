# 🚀 PWA Quick Start Guide

## Instalasi Cepat

### 1️⃣ Persiapan Icons (PENTING!)

Sebelum deploy, pastikan Anda sudah menyiapkan icon aplikasi:

```bash
# Letakkan file icon di /public/icons/ dengan nama:
icon-72x72.png
icon-96x96.png
icon-128x128.png
icon-144x144.png
icon-152x152.png
icon-192x192.png  # ← WAJIB (minimum)
icon-384x384.png
icon-512x512.png  # ← WAJIB (untuk splash screen)
```

💡 **Tip**: Gunakan logo gereja persegi (1024x1024px) lalu resize ke ukuran yang diperlukan.

### 2️⃣ Build & Deploy

```bash
# Install dependencies
npm install

# Build production
npm run build

# Test locally
npm run preview
```

### 3️⃣ Deploy ke Vercel (Recommended)

```bash
# Install Vercel CLI (sekali saja)
npm i -g vercel

# Deploy
vercel --prod
```

Atau connect repository ke Vercel untuk auto-deploy.

## Testing PWA

### ✅ Checklist Sebelum Deploy

1. **Icons**
   - [ ] Icon 192x192 tersedia
   - [ ] Icon 512x512 tersedia
   - [ ] Semua icon format PNG
   - [ ] Icon square dan centered

2. **HTTPS**
   - [ ] Domain menggunakan HTTPS
   - [ ] No mixed content warnings

3. **Manifest**
   - [ ] manifest.json accessible
   - [ ] Theme color match brand
   - [ ] Name dan short_name set

4. **Service Worker**
   - [ ] Service worker registered
   - [ ] Offline fallback works
   - [ ] Cache strategy optimal

### 🧪 Test di Browser

#### Chrome DevTools
1. Buka DevTools (F12)
2. Tab **Application**
3. Check sections:
   - ✅ Manifest: No errors
   - ✅ Service Workers: Activated
   - ✅ Storage: Cache populated

4. Test offline:
   - DevTools → Network tab
   - Toggle "Offline"
   - Refresh page → Should still work

#### Lighthouse Audit
1. DevTools → Lighthouse
2. Select "Progressive Web App"
3. Click "Generate report"
4. Target score: **> 90**

## Install di Perangkat

### 📱 Android (Chrome)
1. Buka aplikasi di Chrome
2. Tap **⋮** (menu)
3. Tap **"Install app"** atau **"Add to Home screen"**
4. Ikuti prompt
5. Icon muncul di home screen

### 🍎 iOS (Safari)
1. Buka aplikasi di Safari
2. Tap **Share button** (⬆️)
3. Scroll dan tap **"Add to Home Screen"**
4. Tap **"Add"**
5. Icon muncul di home screen

### 💻 Desktop (Chrome/Edge)
1. Buka aplikasi di browser
2. Look for **Install icon** (+) di address bar
3. Click **"Install"**
4. App muncul sebagai desktop app

## Verifikasi Installation

### Pastikan PWA Berjalan dengan Baik

✅ **Icon muncul di home screen**
✅ **Buka tanpa browser UI (standalone)**
✅ **Splash screen muncul saat launch** (Android)
✅ **Offline mode berfungsi**
✅ **Performance cepat** (<3s load time)

## Fitur PWA yang Sudah Aktif

### ✅ Implemented
- Service Worker registration
- Offline caching
- Install prompt
- Standalone mode
- Theme color
- Splash screen
- Responsive design
- Fast loading

### 🔄 Coming Soon
- Push notifications
- Background sync
- Share API
- Media handling

## Troubleshooting

### ❌ Install button tidak muncul
**Solution:**
- Pastikan HTTPS enabled
- Check Lighthouse PWA audit
- Clear browser cache
- Verify manifest.json valid

### ❌ Icon tidak muncul
**Solution:**
- Check icon path di manifest.json
- Pastikan icon square PNG
- Minimum 192x192px
- Clear app cache dan reinstall

### ❌ Offline tidak berfungsi
**Solution:**
- Check service worker status
- Verify cache strategy
- Clear cache dan refresh
- Check browser console errors

### ❌ Tidak bisa install di iOS
**iOS limitations:**
- Harus manual "Add to Home Screen"
- Tidak ada install prompt otomatis
- Limited service worker support
- Pastikan manifest valid

## Monitoring & Updates

### Update Strategy
PWA menggunakan **auto-update** strategy:
- Service worker check update setiap load
- Jika ada update, prompt user untuk refresh
- User can continue pakai old version
- Update otomatis saat restart app

### Force Update
Untuk force update semua users:
1. Increment version di service-worker.js
2. Deploy new version
3. Users akan dapat prompt saat buka app

### Clear Cache
Jika perlu reset cache users:
```javascript
// Di browser console
await caches.keys().then(keys => 
  Promise.all(keys.map(key => caches.delete(key)))
);
```

## Best Practices

### 🎯 Performance
- Keep bundle size < 1MB
- Lazy load routes
- Optimize images
- Use code splitting

### 🎨 UX
- Fast initial load
- Smooth animations
- Clear feedback
- Graceful offline handling

### 🔒 Security
- Always use HTTPS
- Validate user input
- Secure localStorage data
- Regular security audits

## Resources

### Documentation
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [MDN Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Workbox Docs](https://developers.google.com/web/tools/workbox)

### Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [PWA Builder](https://www.pwabuilder.com/)
- [Maskable.app](https://maskable.app/) - Icon tester

### Testing
- [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools)
- [ngrok](https://ngrok.com/) - HTTPS tunnel for testing
- [BrowserStack](https://www.browserstack.com/) - Device testing

## Support

**Browser Support:**
- ✅ Chrome (Desktop & Mobile)
- ✅ Edge (Desktop & Mobile)
- ✅ Samsung Internet
- ✅ Opera
- ⚠️ Firefox (Limited)
- ⚠️ Safari (Limited)

**Platform Support:**
- ✅ Android 5.0+
- ⚠️ iOS 11.3+ (Limited features)
- ✅ Windows 10+
- ✅ macOS 10.12+
- ✅ Chrome OS

---

**Ready to go!** 🎉

Aplikasi Anda sudah configured sebagai PWA dan siap di-deploy.
