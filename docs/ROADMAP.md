# Our Space — Roadmap Operasional

Roadmap ini melengkapi `ARCHITECTURE.md`; perubahan fase tidak otomatis berarti penerimaan selesai.

| Fase | Ruang lingkup | Status per 21 Oktober 2026 |
|---|---|---|
| 1 | Capacitor shell, PIN lokal, lifecycle Android, APK | Baseline tersedia; pengguna sudah memakai APK. |
| 2 | Supabase Auth, key binding, fingerprint, chat teks E2EE | Teruji pengguna: chat dua arah dan reopen pada kedua HP. CI build #73 sukses setelah dukungan API 30 digabung. |
| 3 | Media E2EE, progress/error, pratinjau dan save | Kode dan migration Storage sudah siap/diterapkan; CI build kode media berhasil. Menunggu tes kirim/terima media nyata pada dua HP sebelum fase diterima. |
| 4 | FCM dengan payload generik dan izin Android | Menunggu Fase 3 diterima. |
| 5 | WebRTC, signaling privat, TURN, caveat background | Belum dimulai. |
| 6 | Brankas terenkripsi dan log panggilan nyata | Belum dimulai. |
| 7 | Audit keamanan, akun ketiga/RLS, uji negatif dan dokumen rilis | Belum dimulai. |
| 8 | Fitur masa depan | Tidak dikerjakan kecuali diminta. |

## Gate penerimaan setiap fase

1. Unit tests dan audit dependensi lulus.
2. Build web dan APK bertanda tangan stabil lulus.
3. Migrasi aditif ditinjau dan diverifikasi di Supabase.
4. Fitur diuji pada kedua HP, termasuk Android 11/API 30.
5. Kebocoran plaintext, peran ketiga, kesalahan jaringan, pemulihan dan regresi dinilai sebelum merge.

**Prinsip rollout:** jangan uninstall APK untuk update biasa. Jangan reset key atau menghapus pesan yang sudah ada demi membuka fitur baru. Pilih opsi gratis; tidak menambah layanan berbayar atau meminta kartu kredit.
