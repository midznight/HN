# Fase 1 — Shell Capacitor dan PIN lokal

**Branch:** `phase-1-capacitor-shell`  
**Status awal:** source dan workflow ditambahkan. Keberhasilan APK harus dikonfirmasi dari run Actions; perilaku di HP fisik belum dapat dikonfirmasi oleh agen.

## Perubahan

- Port desain prototipe ke Vite + Capacitor Android dengan perubahan visual seminimal mungkin.
- Tailwind CSS build melalui CLI lokal; versi dependency langsung dipin. Lucide, Inter dan Playfair Display dibundel lokal. Referensi Unsplash diganti inisial/placeholder; entrypoint tidak memuat font, icon atau gambar dari host pihak ketiga.
- Onboarding pertama kali memilih identitas sekali, kemudian membuat PIN 6–8 digit dan mengonfirmasi PIN. Salt acak + PBKDF2-HMAC-SHA-256 310.000 iterasi disimpan lokal; PIN plaintext tidak disimpan atau dikirim.
- PIN salah memicu jeda eksponensial dengan cap 5 menit. App terkunci saat background/visibility hidden. Android Back kembali ke Dashboard lalu mengunci app.
- CSS menangani safe area, keyboard chat/adjustResize, dan menonaktifkan blur kaca bila pemantauan frame menunjukkan performa rendah.
- Dashboard widgets, chat, panggilan dan Brankas tanpa data contoh; fitur belum tersedia diberi label. Tidak ada Supabase Auth/E2EE di fase ini.
- GitHub Actions menguji source, membangun asset lokal, membuat proyek Android pada runner cloud, lalu mengunggah APK debug.

## Batas yang disengaja

Auth Supabase, pasangan kunci ECDH native di Android Keystore, chat E2EE, media, FCM, WebRTC, Brankas dan log panggilan belum diimplementasikan. Tombol “Kunci Aplikasi” hanya mengunci layar—tidak menghapus key. Identitas lokal belum memberi akses ke akun server. Gerbang PIN tidak melindungi perangkat yang telah di-root atau dimodifikasi.

## Uji manual di HP

1. Repo → **Actions** → pilih run **Build Android APK (debug)** → unduh artifact `our-space-debug-apk`.
2. Instal APK. Pada instalasi baru pilih identitas dan buat PIN 6–8 digit. Uji konfirmasi yang berbeda.
3. Tutup lalu buka kembali; PIN benar membuka aplikasi, PIN salah ditolak dan percobaan berulang menambah jeda.
4. Aktifkan mode pesawat dan coba unlock lagi.
5. Buka Chat lalu tekan Back: kembali ke Dashboard. Tekan Back di Dashboard: aplikasi terkunci, bukan langsung ditutup.
6. Pindahkan aplikasi ke background lalu buka kembali; layar PIN harus muncul. Tes keyboard chat, status/nav bar, rotasi dan perangkat berperforma rendah.
7. Pastikan tidak ada kebutuhan jaringan untuk PIN/UI setelah APK terinstal.

Jangan tandai fase lulus penuh sampai build Actions dan pengujian perangkat benar-benar sukses.
