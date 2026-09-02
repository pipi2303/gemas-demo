# App Icons untuk PWA

## Ukuran Icon yang Diperlukan

Untuk PWA yang optimal, pastikan Anda memiliki icon dalam ukuran berikut:

- **72x72px** - Android minimal
- **96x96px** - Android small devices
- **128x128px** - Chrome Web Store
- **144x144px** - Windows tiles
- **152x152px** - iOS iPad
- **192x192px** - Android standard (REQUIRED)
- **384x384px** - Android larger devices
- **512x512px** - Splash screens (REQUIRED)

## Cara Generate Icons

### Option 1: Menggunakan Online Tool
1. Buat desain logo 1024x1024px
2. Gunakan https://realfavicongenerator.net/
3. Upload logo Anda
4. Download dan extract ke folder ini

### Option 2: Menggunakan PWA Asset Generator
```bash
npm install -g pwa-asset-generator
pwa-asset-generator logo.svg ./public/icons
```

### Option 3: Manual dengan Design Tool
Gunakan Figma, Photoshop, atau Illustrator:
- Ekspor dalam ukuran yang diperlukan
- Format: PNG dengan transparansi
- Color space: sRGB
- Compression: Optimal quality

## Desain Guidelines

### Logo Design
- **Simple dan Recognizable**: Mudah dikenali dalam ukuran kecil
- **Centered**: Pastikan logo centered dengan padding 10%
- **Safe Zone**: Hindari elemen penting di 10% edge
- **High Contrast**: Pastikan terlihat jelas di berbagai background

### Brand Colors
- **Primary**: #047857 (Emerald-700) - Hijau tua
- **Secondary**: #0891B2 (Cyan-600) - Biru
- **Background**: #FFFFFF (White)

### Maskable Icons
Untuk Android adaptive icons, gunakan format "maskable":
- Safe zone 80% di tengah (circle)
- Full bleed background
- Logo centered

## Current Status

⚠️ **PLACEHOLDER ICONS** - Icons saat ini adalah placeholder.  
🎨 **ACTION REQUIRED**: Ganti dengan logo GPIB Bahtera Kasih yang sebenarnya.

## Checklist

- [ ] Desain logo final 1024x1024px
- [ ] Generate semua ukuran icon
- [ ] Test di Android (icon-192x192.png minimum)
- [ ] Test di iOS (icon-152x152.png untuk iPad)
- [ ] Verify maskable icons work di Android
- [ ] Update manifest.json jika perlu
- [ ] Test install di beberapa devices

## Testing

### Android
1. Install PWA di Android device
2. Check home screen icon
3. Check splash screen saat launch
4. Verify icon shape (circle/square/squircle)

### iOS
1. Add to Home Screen di Safari
2. Check icon di home screen
3. Verify no white border

### Desktop
1. Install dari Chrome/Edge
2. Check icon di taskbar/dock
3. Verify icon di app drawer

## File Naming Convention
```
icon-[size].png
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png ← REQUIRED
- icon-384x384.png
- icon-512x512.png ← REQUIRED
```

## Resources
- [PWA Icon Guidelines](https://web.dev/add-manifest/#icons)
- [Android Adaptive Icons](https://developer.android.com/guide/practices/ui_guidelines/icon_design_adaptive)
- [iOS Icon Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Maskable Icons](https://web.dev/maskable-icon/)
