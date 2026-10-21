# Engineering Report — Our Space

Pembaruan: 21 Oktober 2026, 17:44 WIB.

## Baseline yang telah dikonfirmasi

Pengguna mengonfirmasi chat teks dua arah Hamid ↔ Nur dan aplikasi tetap dapat digunakan setelah ditutup/dibuka kembali. Perangkat pasangan menjalankan Android 11/API 30 dan chat teks berfungsi.

## Hasil implementasi media

- PR #6 menggabungkan lampiran gambar/video/audio terenkripsi hingga 3 MiB per file.
- File dienkripsi di native sebelum diunggah; Storage bucket tetap private dan hanya berisi ciphertext `application/octet-stream`.
- Metadata nama file, MIME, ukuran, path dan nonce ada dalam envelope pesan yang terenkripsi.
- Penerima mendekripsi/authenticate sebelum pratinjau atau simpan. API 29+ menggunakan MediaStore; API 23–28 menyimpan ke ruang dokumen privat aplikasi.
- Migration Fase 3 diterapkan dan diverifikasi pada project Supabase produksi. Pemeriksaan read-only terakhir mengonfirmasi bucket private, limit 4 MiB, dan MIME generik.
- PR #8 menambahkan penjagaan terhadap dekripsi asinkron yang selesai setelah aplikasi terkunci.
- GitHub Actions #91 pada merge commit `4709be0b620db60e7d6ae1b3379ed20b92c43a7c` lulus, termasuk dependency audit, deterministic tests, web build, Capacitor sync dan APK assembly.
- APK pasca-merge tersedia; sertifikatnya cocok dengan APK baseline API 30 yang diperiksa. Tidak ada keharusan uninstall untuk update rutin.

## Snapshot backend dan batas penerimaan

Query read-only sekitar 17:42 WIB menunjukkan 2 pesan teks, 0 media messages, 2 device keys, dan 2 fingerprint verifications. Nilai tersebut adalah snapshot saat diperiksa dan tidak membuktikan uji media.

Fase 3 **belum dinyatakan diterima** karena lampiran belum diuji secara nyata pada kedua HP. Berikutnya: pasang APK sebagai update, uji gambar/audio/video dua arah, kegagalan/limit/retry, save lokal, dan penguncian saat operasi berlangsung. Fase 4 tetap ditahan sampai hasil tersebut lulus. Tidak ada reset key, penghapusan pesan, atau perubahan data chat untuk mengaktifkan media.
