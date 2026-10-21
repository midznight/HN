# Progress — Our Space

Pembaruan: 21 Oktober 2026 — Fase 4 push.

## Baseline stabil yang dikonfirmasi pengguna

- Chat teks E2EE Hamid ↔ Nur berhasil dikirim dua arah.
- Pengguna mengonfirmasi aplikasi tetap dapat digunakan setelah ditutup/dibuka kembali.
- Perangkat pasangan yang menggunakan Android 11/API 30 sudah bisa memakai chat teks.
- Build baseline dukungan API 30 lulus pada GitHub Actions #73.

## Fase 3 — lampiran E2EE

- Implementasi lampiran gambar/video/audio (file yang sudah ada, maksimal 3 MiB) telah digabung melalui [PR #6](https://github.com/midznight/HN/pull/6), merge commit `0297fe5bcd5a158c663dd231ba3835dd818d52d1`.
- Hardening tambahan agar dekripsi asinkron tidak merender pesan/placeholder setelah aplikasi terkunci telah digabung melalui [PR #8](https://github.com/midznight/HN/pull/8), merge commit `4709be0b620db60e7d6ae1b3379ed20b92c43a7c`.
- GitHub Actions #117 lulus untuk privacy shield dan hardening receive-side; CI #124 lulus penuh untuk commit `d14286c0aa53287db7df180624b201b3cfd4103a`.
- PR #10 memperbaiki picker galeri; pengguna mengonfirmasi alur kembali tanpa PIN ulang dan pilihan file tidak hilang pada build sebelum privacy shield.
- PR #11/#12 menambahkan guard receive-side di batas dekripsi metadata, Storage download, dan `Blob.arrayBuffer()`, serta menyembunyikan konten aplikasi selama picker sistem terbuka.
- PR #14 menghentikan alur pengirim jika aplikasi terkunci saat `File.arrayBuffer()` berlangsung, melepas referensi Base64 setelah enkripsi, dan menahan error lama agar tidak muncul di tampilan terkunci.
- Tree kode build #124 identik dengan merge commit utama `44e4e5f1c9a63b35793f2d85773df354ec49afc9`. Privacy shield dan guard pengirim versi terbaru tetap perlu diuji fisik pada kedua HP.
- Migration `20261021170000_phase3_encrypted_media.sql` telah diterapkan dan diverifikasi di project Supabase produksi `sajlpngmpkizwjbarxlj`.
- Bucket `our-space-encrypted-media` dikonfirmasi private, limit objek 4 MiB, dan hanya mengizinkan `application/octet-stream`. Policy SELECT, INSERT terverifikasi, serta DELETE orphan diterapkan pada Storage.
- APK #124 berhasil dibangun; SHA-256 APK `2893ea1d9d6a4ebad786bbf44c2f9491fa7195cf39ad41ad833230fb2199aca6`. Sertifikat SHA-256-nya cocok dengan baseline: `6E48F45D9EEEFB56FD3BC3B4ADA108FDF0B73B7280E6DF6766EF699ADAE2956D`.
- Snapshot backend hanya-baca sekitar 18:44 WIB, 21 Oktober 2026: 21 pesan teks, 2 pesan media, 2 device keys, 2 verifikasi fingerprint, dan 2 objek di bucket privat. Akun Hamid dan Nur masing-masing memiliki satu pesan media dengan objek Storage yang cocok. Ini membuktikan insert pesan dan upload objek dua arah, bukan keberhasilan dekripsi, tampilan, atau penyimpanan di penerima.

## Status penerimaan Fase 3

- [x] Pengguna menyatakan Fase 3 aman dan mengizinkan proyek berlanjut pada 21 Oktober 2026.
- [x] Riwayat CI, migration, storage policy, dan APK ditulis di bagian atas sebagai jejak teknis.
- Status fase mengikuti penerimaan pengguna; daftar uji granular di docs/PHASE3_MEDIA.md dipertahankan sebagai catatan bukti historis, bukan sebagai blocker untuk mulai Fase 4. Penerimaan ini bukan audit keamanan independen.

## Batas dan langkah selanjutnya

Voice note/video note recording, file besar/chunking, multi-file, Double Ratchet/forward secrecy, dan multi-device belum termasuk atau belum tersedia. Jangan menghapus/merotasi kunci maupun menghapus pesan untuk mengatasi masalah UI. Fase 4 fokus pada notifikasi generik yang tidak membocorkan isi chat.

## Fase 3 — penerimaan pengguna

Pengguna mengonfirmasi pada 21 Oktober 2026 bahwa Fase 3 sudah aman dan mengizinkan proyek berlanjut. Status fase dicatat sebagai diterima oleh pengguna; ini bukan klaim audit keamanan independen.

## Fase 4 — notifikasi push

- Implementasi awal ada di branch phase-4/push-notifications.
- FCM hanya menerima judul “Our Space”, isi generik “Ada pesan baru menunggu.”, dan data type=new_message. Teks/ciphertext, pengirim, nama file, metadata media, pair ID, dan message ID tidak masuk payload.
- Tabel device_push_tokens memakai RLS owner-only. Ledger push_dispatches adalah service-role-only.
- Edge Function memvalidasi JWT pengguna, sender id, pair dua anggota, verifikasi fingerprint penerima, umur pesan, dan deduplikasi dispatch.
- Build tanpa FIREBASE_ANDROID_CONFIG_BASE64 tetap hijau tetapi fitur push nonaktif. Tanpa FCM_SERVICE_ACCOUNT_JSON di Supabase, server status ready=false dan aplikasi tidak meminta izin OS.
- PR #16 merged ke integration branch pada commit 16441c87c14b454ab74409a72cfbd53e71446c70; post-merge CI #146 sukses dengan dependency audit, security-contract tests, web build, Capacitor sync, dan signed APK.
- Migration Fase 4 sudah diterapkan di project Supabase sajlpngmpkizwjbarxlj; device_push_tokens dan push_dispatches terverifikasi ber-RLS. Belum ada token/dispatch yang tersimpan.
- Edge Function send-chat-push sudah ACTIVE dengan verify_jwt=true.
- CI #146 mengonfirmasi FIREBASE_ANDROID_CONFIG_BASE64 belum tersedia; APK build ini secara sengaja menonaktifkan push. Secret server FCM_SERVICE_ACCOUNT_JSON harus ditambahkan di Supabase sebelum status ready.
- Berikutnya: masukkan dua secret melalui dashboard masing-masing (jangan di chat/repo), jalankan build baru, lalu uji push dua arah di kedua HP.
