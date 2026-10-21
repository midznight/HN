# Engineering Report — Our Space

Pembaruan: 21 Oktober 2026, 18:53 WIB.

## Baseline yang telah dikonfirmasi

Pengguna mengonfirmasi chat teks dua arah Hamid ↔ Nur dan aplikasi tetap dapat digunakan setelah ditutup/dibuka kembali. Perangkat pasangan menjalankan Android 11/API 30 dan chat teks berfungsi.

## Hasil implementasi media

- PR #6 menggabungkan lampiran gambar/video/audio terenkripsi hingga 3 MiB per file.
- File dienkripsi di native sebelum diunggah; Storage bucket tetap private dan hanya berisi ciphertext `application/octet-stream`.
- Metadata nama file, MIME, ukuran, path dan nonce ada dalam envelope pesan yang terenkripsi.
- Penerima mendekripsi/authenticate sebelum pratinjau atau simpan. API 29+ menggunakan MediaStore; API 23–28 menyimpan ke ruang dokumen privat aplikasi.
- Migration Fase 3 diterapkan dan diverifikasi pada project Supabase produksi. Pemeriksaan read-only terakhir mengonfirmasi bucket private, limit 4 MiB, dan MIME generik.
- PR #8 menambahkan penjagaan terhadap dekripsi asinkron yang selesai setelah aplikasi terkunci.
- PR #10 memperbaiki pemilih galeri agar tidak memicu PIN ulang; pengguna mengonfirmasi picker tidak lagi menghilangkan pilihan file.
- PR #11/#12 menambahkan guard lock pada jalur terima dan privacy shield saat picker terbuka. PR #14 menambahkan guard setelah File.arrayBuffer pada jalur kirim, melepas referensi Base64, serta menahan error lama sesudah lock.
- GitHub Actions #124 lulus penuh pada tree yang identik dengan merge commit `44e4e5f1c9a63b35793f2d85773df354ec49afc9`, termasuk audit dependency, tes keamanan/protokol, web build, Capacitor sync dan APK assembly.
- APK hasil run #124 SHA-256: `2893ea1d9d6a4ebad786bbf44c2f9491fa7195cf39ad41ad833230fb2199aca6`; sertifikat sama dengan baseline `6E48F45D9EEEFB56FD3BC3B4ADA108FDF0B73B7280E6DF6766EF699ADAE2956D`. Update rutin tidak memerlukan uninstall.

## Snapshot backend dan batas penerimaan

Query read-only sekitar 18:44 WIB menunjukkan 21 pesan teks, 2 pesan media, 2 device keys, 2 verifikasi fingerprint dan 2 objek Storage. Masing-masing akun punya satu pesan media dengan objek cocok. Ini bukti upload/insertion server dua arah, bukan bukti penerima berhasil mendekripsi atau menyimpan.

Fase 3 kemudian diterima oleh pengguna pada 21 Oktober 2026; status terkini mengikuti persetujuan tersebut. Detail checklist teknis tetap disimpan pada docs/PHASE3_MEDIA.md sebagai jejak historis. Tidak ada reset kunci, penghapusan pesan, atau perubahan data chat untuk menyelesaikan fase.


## Pembaruan terbaru — 21 Oktober 2026

Pengguna menyatakan Fase 3 sudah aman dan memberi izin melanjutkan. Fase 4 sekarang sedang diimplementasikan dengan notifikasi FCM generik, tabel token ber-RLS owner-only, ledger dispatch service-role-only, dan Edge Function yang memverifikasi JWT pengguna, membership pair, serta verifikasi fingerprint.

Push belum aktif: FIREBASE_ANDROID_CONFIG_BASE64 pada GitHub Actions dan FCM_SERVICE_ACCOUNT_JSON pada Supabase Edge Function Secrets masih membutuhkan setup. Build tanpa konfigurasi sengaja menonaktifkan push dan tidak meminta izin OS. Tidak ada plaintext atau metadata chat di payload FCM.


## Fase 4 — status deployment

- PR #16 telah digabung ke integration branch pada commit 16441c87c14b454ab74409a72cfbd53e71446c70.
- GitHub Actions #145 pada PR dan #146 pasca-merge lulus; audit dependency, security-contract tests, web build, Capacitor sync, serta APK bertanda tangan sukses.
- Migration Fase 4 diterapkan pada Supabase project sajlpngmpkizwjbarxlj. Pemeriksaan hanya-baca mengonfirmasi RLS aktif untuk device_push_tokens dan push_dispatches; belum ada token terdaftar dan belum ada dispatch.
- Edge Function send-chat-push berstatus ACTIVE, verify_jwt=true. Kode menerima current Supabase key environment format maupun nama legacy.
- Build #146 mencatat FIREBASE_ANDROID_CONFIG_BASE64 tidak tersedia dan karena itu sengaja membangun APK dengan push nonaktif. FCM_SERVICE_ACCOUNT_JSON perlu disetel di Supabase Edge Function Secrets.
- Tidak ada service berbayar atau secret yang dimasukkan ke repository/chat. Push belum dinyatakan aktif sampai kedua secret valid, build baru menghasilkan konfigurasi Firebase, dan uji push generik berhasil pada kedua HP.
