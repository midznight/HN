# Blockers — Our Space

Pembaruan: 21 Oktober 2026, 18:53 WIB.

## Blocker aktivasi Fase 4

- Firebase Android config belum tersedia pada repository/build secret. Push client fail-closed sampai GitHub Actions Secret FIREBASE_ANDROID_CONFIG_BASE64 berisi google-services.json valid untuk package com.ourspace.app.
- FCM_SERVICE_ACCOUNT_JSON belum tersedia di Supabase Edge Function Secrets. Tanpa service account JSON yang valid dan project ID yang cocok, Edge Function melaporkan ready=false dan UI tidak meminta izin notifikasi.
- Migration Fase 4 sudah diterapkan pada project Supabase sajlpngmpkizwjbarxlj; Edge Function send-chat-push aktif dengan verifikasi JWT wajib. CI post-merge #146 sukses.
- Run #146 secara eksplisit mencatat Firebase client config tidak tersedia, sehingga APK tersebut menonaktifkan push. Setelah FIREBASE_ANDROID_CONFIG_BASE64 dan FCM_SERVICE_ACCOUNT_JSON diset, perlu build APK baru dan uji di kedua HP.
- Pengujian negatif wajib: izin Android ditolak, token expired, salah project ID, function tidak tersedia, jaringan gagal, notifikasi ganda, tap saat PIN gate aktif, dan token dicabut saat logout.

## Fase 3

Pengguna menyatakan Fase 3 aman pada 21 Oktober 2026 dan proyek boleh berlanjut. Status catatan mengikuti penerimaan pengguna; bukan klaim audit keamanan independen.

## Tidak boleh dilakukan untuk mengatasi blocker

- Jangan hapus row `device_keys`, `key_verifications`, atau `messages` untuk membuat UI “lolos”.
- Jangan publikasikan bucket, unggah file asli, atau menaruh plaintext/kunci di log.
- Jangan menyarankan uninstall untuk update rutin.
- Jangan mengaktifkan layanan berbayar atau meminta kartu kredit.

Fase 3 diterima pengguna pada 21 Oktober 2026. Blocker aktif saat ini adalah konfigurasi Firebase/Supabase untuk mengaktifkan Fase 4 dan uji push setelah konfigurasi tersedia.
