Buatkan desain Roles & Hak Akses (RBAC - Role Based Access Control) untuk aplikasi gereja yang simple, modern, dan mudah dipahami oleh orang non-IT.

Konteks aplikasi:
Aplikasi digunakan untuk operasional gereja seperti:
- Data jemaat
- Jadwal ibadah
- Keuangan gereja
- Pelayanan & komunitas
- Absensi
- Pengumuman
- Event gereja
- Multimedia & live streaming
- Konseling
- Administrasi gereja

Tujuan:
- Roles tidak terlalu banyak
- Hak akses jelas
- Mudah diimplementasikan developer
- Mudah dipahami admin gereja
- Bisa dikembangkan ke depan

Buatkan hasil dalam format berikut:

# 1. Daftar Roles
Contoh:
- Super Admin
- Admin Gereja
- Pendeta
- Bendahara
- Pelayan
- Multimedia
- Jemaat

Untuk setiap role jelaskan:
- Fungsi utama
- Tanggung jawab
- Batas akses

# 2. Daftar Menu/Fitur Aplikasi
Contoh:
- Dashboard
- Data Jemaat
- Jadwal Ibadah
- Keuangan
- Event
- Pengumuman
- Konseling
- Absensi
- Multimedia
- Laporan

# 3. Matrix Hak Akses
Buat dalam bentuk tabel sederhana:
| Menu | Super Admin | Admin | Pendeta | Bendahara | Pelayan | Jemaat |

Gunakan permission:
- View
- Create
- Edit
- Delete
- Approve
- Export

# 4. Penjelasan Permission
Jelaskan arti:
- View
- Create
- Edit
- Delete
- Approve
- Export

Dengan bahasa sederhana dan mudah dipahami.

# 5. Rekomendasi Struktur RBAC Database
Buat struktur tabel sederhana:
- users
- roles
- permissions
- role_permissions
- user_roles

Sertakan:
- nama field
- tipe data
- fungsi field

# 6. Contoh Skenario Penggunaan
Contoh:
- Bendahara hanya bisa akses keuangan
- Pendeta bisa melihat data konseling
- Jemaat hanya bisa melihat jadwal ibadah dan pengumuman

# 7. Best Practice
Berikan saran:
- pembatasan akses
- keamanan
- audit log
- approval data penting
- multi gereja/cabang jika diperlukan

Gunakan bahasa Indonesia yang profesional tetapi mudah dimengerti.
Buat hasil yang clean, terstruktur, dan siap dijadikan dokumentasi developer.