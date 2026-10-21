# Progress — Our Space

Pembaruan: 21 Oktober 2026, 18:45 WIB.

## Baseline stabil yang dikonfirmasi pengguna

- Chat teks E2EE Hamid ↔ Nur berhasil dikirim dua arah.
- Pengguna mengonfirmasi aplikasi tetap dapat digunakan setelah ditutup/dibuka kembali.
- Perangkat pasangan yang menggunakan Android 11/API 30 sudah bisa memakai chat teks.
- Build baseline dukungan API 30 lulus pada GitHub Actions #73.

## Fase 3 — lampiran E2EE

- Implementasi lampiran gambar/video/audio (file yang sudah ada, maksimal 3 MiB) telah digabung melalui [PR #6](https://github.com/midznight/HN/pull/6), merge commit `0297fe5bcd5a158c663dd231ba3835dd818d52d1`.
- Hardening tambahan agar dekripsi asinkron tidak merender pesan/placeholder setelah aplikasi terkunci telah digabung melalui [PR #8](https://github.com/midznight/HN/pull/8), merge commit `4709be0b620db60e7d6ae1b3379ed20b92c43a7c`.
- GitHub Actions #117 pasca-merge lulus pada commit `5c9e79c2c21d63d1dcddac94ea38b6b24a49ded3`.
- PR #10 memperbaiki picker galeri; pengguna mengonfirmasi alur kembali tanpa PIN ulang dan pilihan file tidak hilang.
- PR #11 menambahkan guard setelah dekripsi metadata dan permintaan Storage; PR #12 menambahkan guard setelah pembacaan buffer async dan menyembunyikan konten aplikasi selama picker sistem terbuka.
- Kode PR #12 telah dibangun penuh dan dites di CI. Versi APK dengan privacy shield belum dikonfirmasi ulang pada perangkat nyata, sehingga pemeriksaan itu tetap masuk blocker.
- Migration `20261021170000_phase3_encrypted_media.sql` telah diterapkan dan diverifikasi di project Supabase produksi `sajlpngmpkizwjbarxlj`.
- Bucket `our-space-encrypted-media` dikonfirmasi private, limit objek 4 MiB, dan hanya mengizinkan `application/octet-stream`. Policy SELECT, INSERT terverifikasi, serta DELETE orphan diterapkan pada Storage.
- APK pasca-merge #117 berhasil dibangun; SHA-256 APK `296158190320ce3a617383c482a2ee465fafbe64c58ec13289d8e3abe77d47b4`. Sertifikat SHA-256-nya cocok dengan baseline: `6E48F45D9EEEFB56FD3BC3B4ADA108FDF0B73B7280E6DF6766EF699ADAE2956D`.
- Snapshot backend hanya-baca sekitar 18:44 WIB, 21 Oktober 2026: 21 pesan teks, 2 pesan media, 2 device keys, 2 verifikasi fingerprint, dan 2 objek di bucket privat. Akun Hamid dan Nur masing-masing memiliki satu pesan media dengan objek Storage yang cocok. Ini membuktikan insert pesan dan upload objek dua arah, bukan keberhasilan dekripsi, tampilan, atau penyimpanan di penerima.

## Gate penerimaan Fase 3

- [x] Tes protokol/security-contract, audit dependency, web build, Capacitor sync, dan APK build lulus di CI setelah merge.
- [x] Migration, bucket privat, batas ukuran, MIME bucket, dan policy Storage diverifikasi.
- [x] APK pasca-merge tersedia dan sertifikatnya cocok dengan baseline.
- [x] Kode pemilih galeri PR #10 lulus CI dan perilaku tanpa PIN ulang/retensi file dikonfirmasi oleh pengguna pada build sebelumnya.
- [x] PR #11/#12 lulus tes kontrak keamanan dan APK build; konten aplikasi disembunyikan selama picker terbuka dan alur media berhenti jika status lock berubah pada awaits yang ditangani.
- [x] Bukti backend menunjukkan satu pesan media dan satu objek Storage yang cocok dari masing-masing akun.
- [ ] Uji build #117 dengan privacy shield pada kedua HP; pastikan picker tetap menyerahkan file setelah kembali.
- [ ] Pastikan penerima berhasil mengunduh, mendekripsi, menampilkan, dan menyimpan gambar/audio/video pada kedua arah, termasuk Android 11/API 30.
- [ ] Uji file di atas 3 MiB, MIME tidak didukung, kegagalan jaringan, retry, penguncian saat proses berlangsung, dan simpan lokal.
- [ ] Catat hasil uji perangkat sebelum Fase 3 dinyatakan diterima.

## Batas dan langkah selanjutnya

Voice note/video note recording, file besar/chunking, multi-file, Double Ratchet/forward secrecy, dan multi-device belum termasuk atau belum tersedia. Jangan menghapus/merotasi kunci maupun menghapus pesan untuk mengatasi masalah UI. Fase 4 (push notifications) tetap menunggu uji penerimaan media nyata pada kedua HP.
