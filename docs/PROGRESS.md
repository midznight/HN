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
- Client menambahkan file picker, enkripsi sebelum upload, private Storage, metadata terenkripsi, preview setelah dekripsi, batas 3 MiB dan penanganan gagal/retry.
- Tombol Simpan ke Galeri menggunakan native MediaStore di API 29+; API 23–28 menyimpan ke folder Documents/Our Space dalam penyimpanan privat aplikasi.
- Migration aditif sudah diterapkan ke Supabase produksi (migration `guarded_device_key_recovery` tetap ada; `phase3_encrypted_media` tercatat).
- Verifikasi post-migration: bucket private, 4 MiB maksimum per object, MIME bucket hanya `application/octet-stream`, constraint `messages.message_type` mengizinkan text/media, dan policy Storage sudah tercatat.
- Data sebelum/sesudah migration tidak berubah: 2 pesan teks, 0 media, 2 device keys, 2 fingerprint verifications.
- CI build untuk kode media berhasil pada commit #75/#76/#79. Run #80 berisi dokumentasi dan masih harus dikonfirmasi.

## Verifikasi yang masih harus selesai

- [ ] Run CI final pada commit terbaru hijau.
- [x] Review policy Storage insert/select/delete, bucket private dan limit ukuran.
- [x] Migration diterapkan lalu verifikasi bucket/RLS/constraint di Supabase.
- [ ] APK stabil pasca-merge tersedia.
- [ ] Tes lampiran pada kedua HP, termasuk Android 11/API 30.
- [ ] Coba kegagalan jaringan, file di atas 3 MiB, MIME unsupported, retry dan save lokal.
- [ ] Update checklist berdasarkan hasil nyata.
