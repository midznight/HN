# Our Space — Daftar Fitur

Status diperbarui: 21 Oktober 2026. Status “teruji pengguna” berarti pengguna telah menyatakan tes tersebut berhasil; status itu bukan audit keamanan independen.

| Fitur | Status | Catatan |
|---|---|---|
| PIN lokal dan penguncian aplikasi | Tersedia | PIN lokal bukan kredensial Supabase dan bukan kunci E2EE. |
| Dua akun privat Hamid dan Nur | Tersedia | Membership ditentukan di Supabase, bukan hanya pilihan nama lokal. |
| Chat teks E2EE | Teruji pengguna | Dua arah berhasil pada kedua HP; fingerprint tetap setelah tutup/buka. |
| Android 12/API 31+ | Tersedia | Private key ECDH P-256 non-exportable melalui Android Keystore. |
| Android 11/API 30 | Teruji pengguna untuk chat teks | Fallback membungkus private key P-256 dengan AES-GCM dan kunci AES Android Keystore. Perlindungan terhadap compromise proses lebih lemah daripada API 31+. |
| Pemulihan binding fingerprint | Terbatas | Hanya jika pair belum punya pesan/verifikasi; tidak dapat memulihkan private key yang hilang. |
| Lampiran gambar/video/audio | Implementasi awal pada branch `phase-3/encrypted-media` | CI dan migration Storage lulus; simpan menggunakan MediaStore API 29+ atau folder app-private pada API 23–28. Menunggu uji media nyata di dua HP. |
| Rekam voice note/video note | Belum | Tidak termasuk milestone lampiran saat ini. |
| Notifikasi push FCM | Belum (Fase 4) | Payload rencana harus generik, tanpa plaintext. |
| Panggilan WebRTC | Belum (Fase 5) | Memerlukan signaling/TURN dan tes background OEM. |
| Brankas file terenkripsi | Belum (Fase 6) | Tidak aktif. |
| Audit keamanan formal | Belum (Fase 7) | Tes unit bukan audit independen. |

## Batas utama

Belum ada Double Ratchet/forward secrecy maupun multi-device. Kehilangan private key dapat membuat pesan lama tidak bisa didekripsi. Jangan mengirim plaintext, nama file atau kunci ke database, log, analytics, issue, atau source publik.
