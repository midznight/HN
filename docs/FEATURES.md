# Our Space — Daftar Fitur

Status diperbarui: 21 Oktober 2026. Status “teruji pengguna” berarti pengguna telah menyatakan tes tersebut berhasil; status itu bukan audit keamanan independen.

| Fitur | Status | Catatan |
|---|---|---|
| PIN lokal dan penguncian aplikasi | Tersedia | PIN lokal bukan kredensial Supabase dan bukan kunci E2EE. |
| Dua akun privat Hamid dan Nur | Tersedia | Membership ditentukan di Supabase, bukan hanya pilihan nama lokal. |
| Chat teks E2EE | Teruji pengguna | Dua arah berhasil pada kedua HP; aplikasi tetap bisa digunakan setelah ditutup/dibuka kembali. |
| Android 12/API 31+ | Tersedia | Private key ECDH P-256 non-exportable melalui Android Keystore. |
| Android 11/API 30 | Teruji pengguna untuk chat teks | Fallback membungkus private key P-256 dengan AES-GCM dan kunci AES Android Keystore. Perlindungan terhadap compromise proses lebih lemah daripada API 31+. |
| Pemulihan binding fingerprint | Terbatas | Hanya jika pair belum punya pesan/verifikasi; tidak dapat memulihkan private key yang hilang. |
| Lampiran gambar/video/audio E2EE | Diterima pengguna | Pengguna menyatakan Fase 3 aman pada 21 Oktober 2026. Batas memori WebView tetap dicatat dalam dokumentasi keamanan. |
| Rekam voice note/video note | Belum | Tidak termasuk milestone lampiran saat ini; pemilih hanya mengirim file yang sudah ada. |
| Notifikasi push FCM | Implementasi ter-deploy; masih nonaktif | PR #16 merged; migration dan function aktif dengan JWT wajib. Push tetap fail-closed karena Firebase client config tidak ada pada build #146 dan kredensial server perlu diset. Payload hanya generik. |
| Panggilan WebRTC | Belum (Fase 5) | Memerlukan signaling/TURN dan tes background OEM. |
| Brankas file terenkripsi | Belum (Fase 6) | Tidak aktif. |
| Audit keamanan formal | Belum (Fase 7) | Tes unit dan build CI bukan audit independen. |

## Batas utama

Belum ada Double Ratchet/forward secrecy maupun multi-device. Kehilangan private key dapat membuat pesan lama tidak bisa didekripsi. Jangan mengirim plaintext, nama file atau kunci ke database, log, analytics, issue, atau source publik.
