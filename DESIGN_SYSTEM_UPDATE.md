# Design System Update - GPIB BAHTERA KASIH
## Standardisasi Desain Popup/Dialog untuk Semua Komponen

**Tanggal Update:** 2026-02-06  
**Berdasarkan:** Desain Popup Detail Jemaat yang telah dioptimasi

---

## 📋 Ringkasan Perubahan

Semua popup/dialog di aplikasi telah diupdate menggunakan desain standar yang konsisten, modern, dan user-friendly berdasarkan template Detail Jemaat popup.

---

## 🎨 Design System Specifications

### 1. **Dialog Content Sizes**

```typescript
// File: /src/app/components/ui/dialog-styles.ts

- Large:   max-w-[95vw] w-[1400px]  // Detail & Form dengan banyak field
- Medium:  max-w-[90vw] w-[900px]   // Form standar, detail sederhana
- Default: max-w-[85vw] w-[600px]   // Form kecil
- Small:   max-w-md                  // Konfirmasi, alert
```

### 2. **Standard Styling**

```css
/* Dialog Container */
background: bg-gray-50
max-height: max-h-[90vh]
overflow: overflow-y-auto

/* Dialog Header */
padding-bottom: pb-2
border-bottom: border-b border-gray-200

/* Dialog Title */
color: text-xl text-gray-800

/* Dialog Description */
color: text-sm text-gray-600
```

### 3. **Header Card Preview** (untuk Detail/Edit)

```css
/* Container */
background: bg-gradient-to-r from-emerald-500 to-emerald-600
border-radius: rounded-xl
padding: p-4
shadow: shadow-lg
margin-top: mt-4

/* Avatar */
width: w-16 h-16
background: bg-white
border-radius: rounded-xl
icon-size: w-8 h-8

/* Spacing dari Tabs */
margin-top: mt-[1px]  /* Super compact! */
```

### 4. **Tab Content**

```css
background: bg-white
border-radius: rounded-lg
padding: p-6
margin-top: mt-0
shadow: shadow-sm
```

### 5. **Action Buttons Footer**

```css
/* Container */
display: flex justify-between/justify-end
padding-top: pt-6
border-top: border-t
margin-top: mt-6
background: bg-white
margin-x: -mx-6
margin-bottom: -mb-6
padding-x: px-6
padding-y: py-4
border-radius: rounded-b-lg
```

---

## ✅ Komponen yang Sudah Diupdate

### 1. **MemberManagement.tsx** ✅
- ✅ Detail Dialog: Large (1400px)
- ✅ Form Dialog: Large (1400px) dengan header card preview
- ✅ Delete Confirmation Dialog: Small
- **Features:**
  - Header card dengan avatar
  - 5 tabs untuk data lengkap
  - Grid 3 kolom untuk form
  - Section headers dengan icon

### 2. **FamilyManagement.tsx** ✅
- ✅ Detail Dialog: Large (1400px)
- **Features:**
  - Header card dengan icon Home
  - Info anggota keluarga
  - Grid 3 kolom

### 3. **UserManagement.tsx** ✅
- ✅ Form Dialog: Medium (900px)
- ✅ Reset Password Dialog: Default
- **Features:**
  - Grid 2 kolom
  - Role selection
  - Active status toggle

### 4. **MinistryManagement.tsx** ✅
- ✅ Form Dialog: Medium (900px)
- **Features:**
  - Grid 2 kolom
  - Status toggle
  - Member assignment

### 5. **EventCalendar.tsx** ✅
- ✅ Detail Dialog: Medium (900px)
- ✅ Form Dialog: Medium (900px)
- **Features:**
  - Date/time pickers
  - Event type selection
  - Status management

### 6. **PrayerRequests.tsx** ✅
- ✅ Form Dialog: Medium (900px)
- **Features:**
  - Category selection
  - Privacy toggle
  - Rich textarea

---

## 🎯 Komponen yang Belum Diupdate

### Perlu Review:
- [ ] AttendanceTracking.tsx
- [ ] FinancialManagement.tsx
- [ ] SectorManagement.tsx
- [ ] AnnouncementManagement.tsx
- [ ] MinistryScheduleManagement.tsx
- [ ] NotificationCenter.tsx
- [ ] DataManager.tsx
- [ ] Reports.tsx

---

## 📐 Grid Layout Standards

### Form Grids
```css
/* 2 Columns - Small to Medium Forms */
grid-cols-2 gap-4

/* 3 Columns - Large Forms */
grid-cols-3 gap-4

/* Responsive */
grid-cols-1 md:grid-cols-2 gap-4
grid-cols-1 md:grid-cols-3 gap-4
```

### Span Rules
```css
/* Email, Address, Textarea */
col-span-2  /* dalam grid-cols-3 */

/* Full Width */
col-span-full
```

---

## 🎨 Color Scheme

### Primary Actions
```css
bg-emerald-600 hover:bg-emerald-700
bg-emerald-700 hover:bg-emerald-800
```

### Destructive Actions
```css
bg-red-600 hover:bg-red-700
```

### Secondary Actions
```css
variant="outline"
variant="secondary"
```

### Status Badges
```css
/* Active */
bg-green-500 text-white

/* Inactive */
bg-gray-100 text-gray-700

/* Warning */
bg-yellow-100 text-yellow-700
```

---

## 📦 Reusable Components

### InfoCard Component
```typescript
<InfoCard 
  icon={<Icon />}
  label="Label"
  value="Value"
  compact={false}
  fullWidth={false}
/>
```

### Section Headers
```typescript
<div className="flex items-center gap-2 pb-2 border-b border-emerald-200">
  <Icon className="w-4 h-4 text-emerald-600" />
  <h4 className="font-semibold text-emerald-700">Section Title</h4>
</div>
```

---

## 🚀 Implementation Guide

### Untuk Update Komponen Baru:

1. **Import Dialog Styles** (opsional)
```typescript
import { DialogStyles } from './ui/dialog-styles';
```

2. **Update DialogContent**
```typescript
<DialogContent className={DialogStyles.content.large}>
  <DialogHeader className={DialogStyles.header.default}>
    <DialogTitle className={DialogStyles.header.title}>
      Title
    </DialogTitle>
    <DialogDescription className={DialogStyles.header.description}>
      Description
    </DialogDescription>
  </DialogHeader>
  {/* Content */}
</DialogContent>
```

3. **Add Header Card (untuk Detail/Edit)**
```typescript
<div className={DialogStyles.headerCard.container}>
  {/* Header content */}
</div>
```

4. **Add Content Card**
```typescript
<div className={DialogStyles.tabs.content}>
  <div className="grid grid-cols-3 gap-4">
    {/* Form fields */}
  </div>
</div>
```

5. **Add Action Buttons**
```typescript
<div className={DialogStyles.footer.container}>
  <div className={DialogStyles.buttonGroup}>
    <Button variant="outline">Batal</Button>
    <Button className={DialogStyles.button.primary}>Simpan</Button>
  </div>
</div>
```

---

## 📱 Responsive Behavior

### Breakpoints
- Mobile: < 768px → Stack columns, reduce padding
- Tablet: 768px - 1024px → 2 columns
- Desktop: > 1024px → Full width (1400px/900px)

### Width Adjustments
```css
max-w-[95vw]  /* Mobile */
w-[1400px]    /* Desktop */
```

---

## ♿ Accessibility

✅ Keyboard navigation support  
✅ Focus management  
✅ ARIA labels  
✅ Color contrast compliance  
✅ Screen reader friendly  

---

## 🔄 Migration Checklist

Untuk setiap komponen yang akan diupdate:

- [ ] Backup file original
- [ ] Update DialogContent size
- [ ] Add/update DialogHeader styling
- [ ] Add header card (jika detail/edit)
- [ ] Update tab content styling
- [ ] Add/update action buttons footer
- [ ] Adjust grid layout (2 atau 3 kolom)
- [ ] Test responsiveness
- [ ] Test functionality
- [ ] Review UX flow

---

## 📝 Notes

- Semua dialog menggunakan `bg-gray-50` untuk container
- Tab content menggunakan `bg-white` dengan shadow
- Spacing dari header card ke tabs adalah `mt-[1px]` (sangat compact)
- Footer buttons memiliki negative margin untuk extend ke edge
- Icons menggunakan size `w-4 h-4` untuk consistency

---

## 🎓 Best Practices

1. **Always use consistent spacing**: mt-4, p-6, gap-4
2. **Use semantic color classes**: emerald for primary, red for destructive
3. **Add loading states** untuk form submissions
4. **Add validation feedback** untuk form fields
5. **Use proper labels** dengan htmlFor attributes
6. **Add helper text** untuk field yang kompleks
7. **Test keyboard navigation** sebelum commit
8. **Ensure mobile responsiveness** di semua breakpoints

---

## 🐛 Common Issues & Solutions

### Issue: Dialog terlalu tinggi di mobile
**Solution:** Gunakan `max-h-[90vh]` dan `overflow-y-auto`

### Issue: Form fields terlalu rapat
**Solution:** Gunakan `gap-4` untuk spacing yang nyaman

### Issue: Button tidak align
**Solution:** Gunakan `flex justify-end` untuk right align

### Issue: Header card tidak muncul
**Solution:** Check conditional rendering dan data availability

---

**Dokumentasi ini adalah living document dan akan diupdate seiring perkembangan aplikasi.**

---

## 👨‍💻 Developer

GEMAS  
GPIB BAHTERA KASIH  
2026
