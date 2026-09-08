// Target render untuk modal/dialog yang perlu keluar dari alur DOM normal
// (React Portal) — Radix Dialog/AlertDialog, panel Notifikasi, dan modal
// Aksesibilitas. Diarahkan ke sebuah <div> di dalam `.content-area`
// (lihat DashboardLayout.tsx) supaya modal selalu terkurung di AREA CONTENT
// UTAMA dan tidak pernah menutupi sidebar atau header.
//
// Fallback ke document.body kalau elemen belum ter-mount (misal saat render
// pertama sebelum DashboardLayout selesai mount) — situasi ini seharusnya
// tidak pernah terjadi di alur normal aplikasi (semua modal dibuka lewat
// interaksi user setelah layout utama sudah mount), tapi fallback ini
// mencegah crash kalau suatu saat ada penggunaan di luar DashboardLayout.
export const CONTENT_AREA_MODAL_ROOT_ID = 'content-area-modal-root';

export function getModalRootEl(): HTMLElement {
  return document.getElementById(CONTENT_AREA_MODAL_ROOT_ID) ?? document.body;
}
