# Progress — Our Space

Pembaruan: 21 Oktober 2026 (Asia/Jakarta).

## Baseline stabil yang dikonfirmasi pengguna

- Chat teks dua arah Hamid ↔ Nur berjalan.
- Fingerprint tetap konsisten setelah aplikasi ditutup dan dibuka kembali.
- HP pasangan Android 11/API 30 bisa menggunakan chat teks.
- Build setelah dukungan API 30 digabung: GitHub Actions #73 sukses.

## Sedang dikerjakan

- Fase 3: lampiran gambar/video/audio terenkripsi pada branch `phase-3/encrypted-media`.
- Native plugin memiliki `encryptMedia`/`decryptMedia`; key derivation dan AAD dipisah dari chat teks.
- Client menambahkan file picker, enkripsi sebelum upload, private Storage, metadata terenkripsi, preview/save sesudah dekripsi, batas 3 MiB dan penanganan gagal/retry.
- Migration Storage bersifat aditif dan belum boleh dianggap aktif di produksi sampai dijalankan serta diverifikasi.
- Workflow telah diubah agar menjalankan CI untuk branch `phase-3/**`.

## Verifikasi yang harus selesai sebelum merge

- [ ] CI final pada commit terbaru hijau.
- [ ] Review final SQL policy insert/select/delete, bucket private dan limit ukuran.
- [ ] Migration diterapkan lalu verifikasi bucket/RLS/constraint di Supabase.
- [ ] Build APK stabil pasca-merge tersedia.
- [ ] Tes lampiran pada kedua HP, termasuk Android 11/API 30.
- [ ] Update checklist dan blocker berdasarkan hasil nyata.
