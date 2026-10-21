# Our Space

Our Space adalah aplikasi privat Android untuk dua pengguna, Hamid dan Nur. Tujuannya adalah percakapan teks dan lampiran yang dienkripsi end-to-end, dengan PIN lokal, verifikasi fingerprint perangkat, serta area UI untuk Kita dan Brankas.

## Status proyek

Status per 21 Oktober 2026: kandidat implementasi dan QA, **belum siap dinyatakan production-ready**. Baseline chat teks E2EE dan lampiran sebelumnya telah diuji/diterima pengguna; UI baru, Brankas, dan panggilan WebRTC masih memerlukan CI final dan tes dua perangkat.

- [Roadmap](docs/ROADMAP.md)
- [Daftar fitur dan batas](docs/FEATURES.md)
- [Blockers yang masih aktif](docs/BLOCKERS.md)
- [Checklist rilis](docs/RELEASE_CHECKLIST.md)
- [Laporan UI](docs/UI_IMPLEMENTATION_REPORT.md)

## Fitur dan keadaan

- Tiga tab utama: Obrolan, Kita, Brankas. Sesudah PIN, aplikasi diarahkan ke Obrolan.
- Chat teks E2EE memakai native Android Keystore dan fingerprint pair yang diverifikasi.
- Foto/video/audio yang sudah ada dapat dikirim dengan alur pilih → pratinjau → konfirmasi.
- Brankas mengenkripsi file dan metadata pada perangkat; bucket Storage tetap privat.
- Panggilan suara/video adalah implementasi awal. Memerlukan foreground, izin mikrofon/kamera, dan jaringan P2P; tidak ada incoming call saat aplikasi tertutup. Tanpa TURN, panggilan tidak dijamin di seluruh jaringan.
- Push FCM tetap fail-closed sampai Workload Identity Federation dan secrets server dikonfigurasi dan uji dua HP lulus.

Tanggal jadian belum ditetapkan. UI tidak boleh mengarang tanggal, hitung hari, atau kenangan.

## Stack

- Vite, JavaScript, Tailwind CSS, Capacitor Android 6
- Supabase Auth, Postgres RLS, Realtime, private Storage dan Edge Functions
- Native Android Keystore plugin untuk identitas/kriptografi E2EE
- GitHub Actions untuk tes, build web dan kandidat APK

Anggaran dijaga Rp0. Tidak ada layanan berbayar atau metode pembayaran yang ditambahkan dari branch ini.

## Prasyarat lokal

- Node.js 22.x (lihat engines di package.json)
- npm dengan package-lock.json yang sesuai
- Java 17 dan Android SDK untuk membangun APK
- Nilai konfigurasi Supabase yang cocok dengan environment pengujian; lihat .env.example. Jangan commit .env atau rahasia.

## Build web

1. Jalankan `npm ci`.
2. Jalankan `npm test`.
3. Jalankan `npm run build`.
4. Hasil web ada di folder `dist/`.

## Build Android

Workflow resmi berada di .github/workflows/android-debug.yml. Ia menjalankan tes, build web, sinkronisasi Capacitor, menyuntikkan plugin Keystore native, dan membutuhkan secret signing stabil untuk APK yang dapat dipasang sebagai update.

Jangan membuat APK dengan tanda tangan sementara untuk dipasang menimpa aplikasi yang telah digunakan. Jangan uninstall, reset key binding, menghapus pesan, atau menghapus data Supabase hanya untuk membuka fitur baru. Detail update in-place: [docs/ANDROID_APK_UPDATES.md](docs/ANDROID_APK_UPDATES.md).

## Privasi dan keterbatasan

- Server menyimpan ciphertext untuk pesan, metadata media, Brankas, signaling dan riwayat panggilan; routing metadata tetap terlihat.
- PIN lokal bukan login Supabase dan bukan key E2EE.
- Kehilangan private key dapat menyebabkan riwayat lama tidak dapat dibuka. Jangan reset key secara otomatis.
- File media dibatasi 3 MiB agar pemakaian memori WebView/native tetap terkendali.
- Belum ada Double Ratchet/forward secrecy, perekaman voice note dari aplikasi, sinkronisasi reaksi/balasan yang lengkap, incoming-call push, atau audit keamanan independen.
- Jangan klaim siap produksi sebelum seluruh gate di RELEASE_CHECKLIST.md terverifikasi di CI dan pada perangkat sebenarnya.
