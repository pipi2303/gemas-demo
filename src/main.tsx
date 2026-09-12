
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { registerSW } from "virtual:pwa-register";
  import { toast } from "sonner";

  createRoot(document.getElementById("root")!).render(<App />);

  // Update PWA -- vite-plugin-pwa (registerType: 'autoUpdate') sudah membuat
  // service worker baru langsung skipWaiting()+clientsClaim() begitu terdeteksi
  // saat build baru di-deploy (lihat dist/sw.js), TAPI sebelumnya TIDAK ADA kode
  // client yang memanggil virtual:pwa-register sama sekali -- jadi registerSW.js
  // yang otomatis di-inject cuma navigator.serviceWorker.register() polos, tanpa
  // deteksi update ataupun reload apa pun. Akibatnya tab yang sudah terbuka
  // terus menjalankan bundle JS lama selamanya (silent stale) sampai user
  // menutup-buka tab / hard refresh manual -- user tidak pernah tahu ada versi
  // baru. Dengan registerSW() di sini, event 'activated' dari service worker
  // baru (isUpdate/isExternal) memicu onNeedReload -- kita TIDAK langsung
  // window.location.reload() paksa (bisa menghilangkan input form yang sedang
  // diisi user), tapi tampilkan toast supaya user yang memutuskan kapan reload.
  function showUpdateToast() {
    toast("Versi baru GEMAS tersedia", {
      description: "Muat ulang untuk memakai versi terbaru. Simpan dulu perubahan yang sedang Anda kerjakan.",
      duration: Infinity,
      action: {
        label: "Muat Ulang",
        onClick: () => window.location.reload(),
      },
    });
  }

  registerSW({
    onNeedReload: showUpdateToast,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // autoUpdate: skipWaiting/clientsClaim terjadi di level SW segera setelah
      // instalasi selesai -- kita tetap cek berkala (selain event 'activated'
      // bawaan library) supaya update tetap terdeteksi walau tab dibiarkan
      // terbuka lama tanpa navigasi (mis. dibiarkan idle semalaman).
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error("Gagal mendaftarkan service worker (PWA):", error);
    },
  });
