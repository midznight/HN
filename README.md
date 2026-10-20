# Our Space — aplikasi Android privat

Our Space adalah shell Android untuk UI Onyx & Champagne, ditujukan untuk Hamid dan Nur. Status pengerjaan: **Fase 1 — shell offline dan gerbang PIN lokal**.

## Build preview

- Node.js 22.12 atau lebih baru
- Java 21 untuk build Android
- Android Studio tidak diperlukan untuk build APK di GitHub Actions

Jalankan UI browser:

```sh
npm install
npm run dev
```

Preview browser hanya untuk memeriksa tata letak. Uji Web Crypto, tombol Back native dan lifecycle melalui APK Android.

## Unduh APK debug

Push pada source membangunkan workflow **Build Android APK (debug)**. Buka tab **Actions**, pilih run terbaru yang sukses, lalu unduh artifact `our-space-debug-apk`. APK debug tidak memerlukan key signing release.

## Batas Fase 1

Pada instalasi baru, pengguna memilih identitas lalu membuat PIN 6–8 digit. PIN disimpan hanya sebagai hash salted PBKDF2-HMAC-SHA-256; identitas disimpan lokal. Chat E2EE, media, FCM, panggilan dan Brankas belum aktif serta tidak menampilkan data contoh.

Lihat [ARCHITECTURE.md](./ARCHITECTURE.md), [SETUP.md](./SETUP.md), dan [docs/PHASE1.md](./docs/PHASE1.md).

> Gerbang PIN fase ini bukan E2EE dan belum melindungi dari modifikasi pada perangkat yang telah di-root. Jangan gunakan untuk bertukar pesan pribadi sebelum Fase 2 lulus audit.
