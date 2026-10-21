# Blockers — Our Space

Pembaruan: 21 Oktober 2026.

## Blocker aktivasi Fase 4

- Firebase Android config belum tersedia pada repository/build secret. Push client fail-closed sampai GitHub Actions Secret FIREBASE_ANDROID_CONFIG_BASE64 berisi google-services.json valid untuk package com.ourspace.app.
- Penghambat autentikasi berganti: PR #22 menghapus kebutuhan FCM_SERVICE_ACCOUNT_JSON dan menambahkan WIF. Provider OIDC, dua subject binding, tiga Edge Function secrets, dan konfigurasi Firebase client belum selesai; fungsi aktif masih versi sebelumnya.
- Migration Fase 4 sudah diterapkan pada project Supabase sajlpngmpkizwjbarxlj; Edge Function send-chat-push aktif dengan verifikasi JWT wajib. PR #18, CI #152, dan CI pasca-merge #153 sukses.
- CI #171 pada head PR #22 lulus penuh. PR #22 sudah digabung ke `phase-2/e2ee-text-chat` dan Edge Function `send-chat-push` versi 2 sudah dideploy dengan `verify_jwt=true`. Probe akan tetap `ready=false` sampai konfigurasi WIF dan Firebase Android client tersedia.
- Pengujian negatif wajib: izin Android ditolak, token expired, salah project ID, function tidak tersedia, jaringan gagal, notifikasi ganda, tap saat PIN gate aktif, dan token dicabut saat logout.

## Fase 3

Pengguna menyatakan Fase 3 aman pada 21 Oktober 2026 dan proyek boleh berlanjut. Status catatan mengikuti penerimaan pengguna; bukan klaim audit keamanan independen.

## Tidak boleh dilakukan untuk mengatasi blocker

- Jangan hapus row `device_keys`, `key_verifications`, atau `messages` untuk membuat UI “lolos”.
- Jangan publikasikan bucket, unggah file asli, atau menaruh plaintext/kunci di log.
- Jangan menyarankan uninstall untuk update rutin.
- Jangan mengaktifkan layanan berbayar atau meminta kartu kredit.

Fase 3 diterima pengguna pada 21 Oktober 2026. Blocker aktif adalah konfigurasi WIF dan Firebase Android client, pengujian autentikasi Google nyata, serta uji push dua arah.

## Jalur keyless yang sedang disiapkan

- Panduan: `docs/FCM-WORKLOAD-IDENTITY.md`.
- Google service account tetap perlu dibuat dengan hak FCM minimum, tetapi tidak ada JSON key yang dibuat.
- Jangan melonggarkan provider condition; hanya UUID dua akun privat yang boleh lolos.
- Kode runtime dideploy tetapi pertukaran token Google belum diuji karena pool/provider, IAM bindings dan secrets belum dikonfigurasi. Jangan menyatakan push aktif sebelum probe token dan uji kedua HP berhasil.

- Pemeriksaan Supabase sesudah deploy: `send-chat-push` berstatus ACTIVE, versi 2, `verify_jwt=true`. Kode tidak lagi membaca `FCM_SERVICE_ACCOUNT_JSON`; konfigurasi kosong akan membuat push tetap nonaktif.
