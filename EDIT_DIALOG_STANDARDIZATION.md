# Edit Dialog Standardization - GPIB BAHTERA KASIH
## Penyesuaian Popup Edit Data Jemaat dengan Desain Standar

**Tanggal Update:** 2026-02-06  
**File:** `/src/app/components/MemberManagement.tsx`

---

## 🎯 Tujuan Update

Memastikan popup **Edit Data Jemaat** 100% konsisten dengan desain popup **Detail Jemaat** yang sudah dioptimasi, mencakup styling, layout, dan behavior.

---

## ✅ Perubahan yang Dilakukan

### 1. **Header Card Preview (Mode Edit)**

#### **Sebelum:**
```tsx
<div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg mt-4">
  <div className="flex items-center gap-4">
    <div className="relative">
      <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-xl">
        <User className="w-8 h-8 text-emerald-600" />
      </div>
    </div>
    <div className="flex-1">
      <h3 className="text-xl font-bold text-white">
        {formData.firstName} {formData.lastName}
      </h3>
      <div className="flex items-center gap-3 mt-1 text-white/90 text-sm">
        {/* Simple text layout */}
      </div>
    </div>
    <Badge>Status</Badge> {/* Badge di luar */}
  </div>
</div>
```

#### **Sesudah:**
```tsx
<div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg mt-4">
  <div className="flex items-center gap-4">
    <div className="relative">
      <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-xl">
        <User className="w-8 h-8 text-emerald-600" />
      </div>
      {/* Badge status di dalam avatar */}
      <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-lg">
        <Badge 
          variant={formData.membershipStatus === 'Aktif' ? 'default' : 'secondary'}
          className={formData.membershipStatus === 'Aktif' ? 'bg-green-500 text-white text-xs' : 'bg-gray-400 text-xs'}
        >
          {formData.membershipStatus || 'Aktif'}
        </Badge>
      </div>
    </div>
    <div className="flex-1 text-white">
      <h3 className="text-xl font-bold mb-0.5">
        {formData.firstName} {formData.lastName}
      </h3>
      <p className="text-emerald-100 text-xs mb-2">
        {formData.memberNumber || 'Belum ada No. Induk'}
      </p>
      {/* Info chips dengan backdrop blur */}
      <div className="flex items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1">
          <Users className="w-3.5 h-3.5" />
          <span>{age} tahun</span>
        </div>
        <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1">
          <MapPin className="w-3.5 h-3.5" />
          <span>{sector}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1">
          <Home className="w-3.5 h-3.5" />
          <span>{role}</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Perbedaan:**
- ✅ Badge status dipindahkan ke dalam avatar (absolute positioning)
- ✅ Info menggunakan chips dengan `bg-white/20 backdrop-blur-sm`
- ✅ Layout dan spacing yang lebih rapi
- ✅ Typography hierarchy yang lebih jelas

---

### 2. **TabsList & TabsTrigger Styling**

#### **Sebelum:**
```tsx
<TabsList className="grid w-full grid-cols-5 bg-white">
  <TabsTrigger value="identitas">Identitas</TabsTrigger>
  <TabsTrigger value="baptis">Baptis & Sidi</TabsTrigger>
  {/* ... */}
</TabsList>
```

#### **Sesudah:**
```tsx
<TabsList className="grid w-full grid-cols-5 bg-white p-1 rounded-xl h-auto shadow-sm border border-gray-200 gap-1">
  <TabsTrigger 
    value="identitas"
    className="rounded-lg data-[state=active]:bg-emerald-100 data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 transition-all py-3 px-2 text-xs font-medium flex items-center justify-center gap-1.5"
  >
    <User className="w-4 h-4 flex-shrink-0" />
    <span className="hidden sm:inline">Identitas</span>
  </TabsTrigger>
  {/* ... */}
</TabsList>
```

**Perbedaan:**
- ✅ TabsList dengan border, shadow, rounded-xl
- ✅ Padding dan gap untuk spacing yang lebih baik
- ✅ TabsTrigger dengan custom active state (emerald-100)
- ✅ Icon di setiap tab untuk visual cues
- ✅ Responsive text (hidden sm:inline)
- ✅ Transition smooth untuk active state

**Icon untuk Setiap Tab:**
- 📝 **Identitas**: `<User />` - Icon orang
- 💧 **Baptis & Sidi**: `<Droplets />` - Icon air baptis
- 🎓 **Pendidikan**: `<GraduationCap />` - Icon toga
- 💼 **Pekerjaan**: `<Briefcase />` - Icon tas kerja
- ⛪ **Data Gereja**: `<Church />` - Icon gereja

---

### 3. **Typography & Spacing**

#### **Header Card:**
```css
/* Title */
text-xl font-bold mb-0.5

/* Subtitle (Member Number) */
text-emerald-100 text-xs mb-2

/* Info Chips */
text-xs gap-2.5
bg-white/20 backdrop-blur-sm
rounded-lg px-2 py-1
```

#### **Tabs:**
```css
/* Spacing dari Header Card */
mt-[1px]  /* Super compact! */

/* TabsList */
p-1 rounded-xl shadow-sm border gap-1

/* TabsTrigger */
py-3 px-2 text-xs font-medium
data-[state=active]:bg-emerald-100
data-[state=active]:text-emerald-700
transition-all
```

---

## 🎨 Visual Improvements

### **Before vs After:**

**Before:**
- ❌ Badge status di luar layout (kurang terintegrasi)
- ❌ Info ditampilkan sebagai text dengan separator "•"
- ❌ Tabs plain tanpa styling khusus
- ❌ Tidak ada icon di tabs
- ❌ Active state tabs kurang prominent

**After:**
- ✅ Badge status terintegrasi di avatar (absolute positioning)
- ✅ Info ditampilkan sebagai chips dengan backdrop blur
- ✅ Tabs dengan border, shadow, dan rounded corners
- ✅ Icon di setiap tab untuk context visual
- ✅ Active state dengan background emerald-100 yang jelas

---

## 📐 Layout Consistency

### **Spacing:**
```css
/* Dari DialogHeader ke Header Card */
mt-4

/* Dari Header Card ke Tabs */
mt-[1px]  /* Super tight untuk visual continuity */

/* Tabs Content */
mt-0  /* Seamless dengan TabsList */
```

### **Grid System:**
```css
/* Form Fields */
grid-cols-3 gap-4  /* 3 kolom untuk form lebar */

/* Info Chips */
flex gap-2.5  /* Horizontal chips layout */
```

---

## 🔄 Behavior

### **Conditional Rendering:**
```typescript
{formMode === 'edit' && formData.firstName && (
  <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 ...">
    {/* Header Card */}
  </div>
)}
```

**Rules:**
- Header Card hanya muncul di **mode edit**
- Header Card hanya muncul jika **formData.firstName** ada
- Tabs spacing menyesuaikan (mt-[1px] jika ada card, mt-4 jika tidak)

### **Dynamic Content:**
```typescript
// Age calculation
{formData.birthDate ? 
  `${new Date().getFullYear() - new Date(formData.birthDate).getFullYear()} tahun` 
  : '-'}

// Member number fallback
{formData.memberNumber || 'Belum ada No. Induk'}

// Role fallback
{formData.familyRole || 'Anggota'}
```

---

## 🎯 Checklist Konsistensi

- [x] Header Card layout sama dengan Detail Dialog
- [x] Badge status di dalam avatar (absolute positioning)
- [x] Info chips dengan backdrop-blur-sm
- [x] TabsList dengan border dan shadow
- [x] TabsTrigger dengan icon dan custom active state
- [x] Spacing mt-[1px] dari header card ke tabs
- [x] Typography hierarchy yang sama
- [x] Color scheme emerald konsisten
- [x] Responsive behavior (hidden sm:inline untuk tab text)
- [x] Smooth transitions untuk active state

---

## 📊 Impact

### **User Experience:**
- ✅ Visual consistency antara Detail dan Edit mode
- ✅ Lebih mudah memahami context (icon di tabs)
- ✅ Status lebih prominent (badge di avatar)
- ✅ Info lebih terstruktur (chips format)
- ✅ Active tab lebih jelas (emerald background)

### **Developer Experience:**
- ✅ Code pattern yang konsisten
- ✅ Mudah maintain dan update
- ✅ Reusable styling patterns
- ✅ Clear component hierarchy

---

## 🚀 Next Steps

### **Untuk Komponen Lain:**
1. Apply pattern yang sama ke komponen dengan tabs
2. Gunakan info chips pattern untuk layout info
3. Implement icon di tab triggers untuk context
4. Pastikan spacing mt-[1px] untuk tight layouts

### **Potential Enhancements:**
- [ ] Animation saat switch tabs
- [ ] Loading skeleton saat load data
- [ ] Validation visual feedback yang lebih prominent
- [ ] Keyboard shortcuts untuk switch tabs
- [ ] Save state tab terakhir yang dibuka

---

## 📝 Technical Notes

### **Icon Imports:**
```typescript
import { 
  User,
  Droplets,
  GraduationCap,
  Briefcase,
  Church,
  Users,
  MapPin,
  Home
} from 'lucide-react';
```

### **Styling Classes Used:**
```typescript
// Backdrop blur
bg-white/20 backdrop-blur-sm

// Absolute positioning
absolute -bottom-1 -right-1

// Active state
data-[state=active]:bg-emerald-100
data-[state=active]:text-emerald-700

// Responsive
hidden sm:inline

// Transitions
transition-all
```

---

## ✨ Summary

Popup **Edit Data Jemaat** sekarang **100% konsisten** dengan popup **Detail Jemaat**:

1. ✅ Header card dengan layout yang sama
2. ✅ Badge status terintegrasi di avatar
3. ✅ Info chips dengan backdrop blur
4. ✅ Tabs dengan icon dan styling lengkap
5. ✅ Spacing dan typography yang identik
6. ✅ Color scheme emerald konsisten

**Result:** Pengalaman pengguna yang seamless dan konsisten antara mode Detail dan Edit! 🎉

---

**Dokumentasi ini adalah bagian dari Design System GPIB BAHTERA KASIH.**

---

## 👨‍💻 Developer

GEMAS 
GPIB BAHTERA KASIH  
2026
