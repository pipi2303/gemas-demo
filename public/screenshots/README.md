# App Screenshots untuk PWA

## Purpose
Screenshots ditampilkan di:
- App install prompt (Chrome/Android)
- Chrome Web Store (jika dipublish)
- PWA catalog websites

## Ukuran Screenshot

### Desktop (Wide Form Factor)
- **Recommended**: 1280x720px atau 1920x1080px
- **Aspect Ratio**: 16:9
- **Format**: PNG or JPG
- **Max Size**: < 1MB per file

### Mobile (Narrow Form Factor)
- **Recommended**: 750x1334px (iPhone 8) atau 1080x1920px
- **Aspect Ratio**: 9:16 atau serupa
- **Format**: PNG or JPG
- **Max Size**: < 1MB per file

## Guidelines

### Content
1. **Tampilkan fitur utama**:
   - Dashboard overview
   - Data jemaat
   - Jadwal kegiatan
   - Keuangan
   - Mobile view

2. **Clean & Professional**:
   - Hapus data sensitif
   - Gunakan data dummy yang realistis
   - Pastikan UI clean (no errors/warnings)

3. **Annotated** (Optional):
   - Tambah caption/label untuk highlight fitur
   - Arrow atau highlight untuk call attention

### Composition
- **Centered**: Main content di tengah
- **Good Lighting**: High contrast, readable text
- **Status Bar**: Hide atau clean (full battery, good signal)
- **Consistent**: Same style untuk semua screenshots

## Cara Capture Screenshot

### Desktop
1. Buka aplikasi di browser (1280x720 viewport)
2. Navigate ke halaman yang ingin di-screenshot
3. Chrome DevTools → Toggle device toolbar (Cmd/Ctrl + Shift + M)
4. Select "Responsive" dan set 1280x720
5. Capture screenshot (Cmd/Ctrl + Shift + P → "Capture screenshot")

### Mobile
1. Chrome DevTools → Device mode
2. Select "iPhone 8" atau "Pixel 5"
3. Navigate ke halaman
4. Capture screenshot (seperti di atas)

### Native Device
1. Install PWA di device
2. Open app
3. Take screenshot (Power + Volume down untuk Android)
4. Transfer ke computer
5. Resize jika perlu

## Recommended Screenshots

Minimum **3 screenshots**, maximum **8 screenshots**:

1. **Dashboard** - Overview dengan statistics
2. **Data Jemaat** - Member management view
3. **Kegiatan** - Event calendar
4. **Keuangan** - Financial overview (optional)
5. **Mobile View** - Responsive design showcase

## File Naming

```
desktop-1.png    # Dashboard
desktop-2.png    # Data Jemaat
mobile-1.png     # Mobile Dashboard
mobile-2.png     # Mobile Navigation
```

## Manifest Configuration

Update `/public/manifest.json` dengan screenshot paths:

```json
{
  "screenshots": [
    {
      "src": "/screenshots/desktop-1.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Dashboard utama dengan statistik jemaat"
    },
    {
      "src": "/screenshots/mobile-1.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Tampilan mobile responsive"
    }
  ]
}
```

## Privacy Considerations

⚠️ **PENTING**: Pastikan tidak ada data sensitif di screenshots:
- Nama lengkap real people
- Nomor telepon
- Alamat lengkap
- Data keuangan real
- Email addresses
- NIK atau data pribadi lainnya

✅ Gunakan data dummy atau blur/redact data sensitif.

## Quality Checklist

- [ ] Resolution sesuai (min 1280x720 desktop, 750x1334 mobile)
- [ ] File size < 1MB per file
- [ ] Format PNG atau JPG
- [ ] No data sensitif
- [ ] UI clean (no errors)
- [ ] Readable text
- [ ] Good contrast
- [ ] Representative of actual app

## Tools

- **macOS**: Cmd + Shift + 4 (area screenshot)
- **Windows**: Snipping Tool atau Win + Shift + S
- **Chrome DevTools**: Device toolbar + Capture screenshot
- **Editing**: Figma, Photoshop, Canva untuk annotations

## Testing

Preview screenshots di:
1. Chrome install prompt (Android)
2. App info screen setelah install
3. Chrome Web Store listing (if published)

---

**Status**: ⚠️ Screenshots placeholder - Action required
**Priority**: Medium (Nice to have, not required for PWA to work)
