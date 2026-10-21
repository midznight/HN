# Our Space — Roadmap Operasional

Roadmap ini melengkapi `ARCHITECTURE.md`; perubahan fase tidak otomatis berarti penerimaan selesai.

| Fase | Ruang lingkup | Status per 21 Oktober 2026 |
|---|---|---|
| 1 | Capacitor shell, PIN lokal, lifecycle Android, APK | Baseline tersedia; APK sudah dipakai pengguna. |
| 2 | Supabase Auth, key binding, fingerprint, chat teks E2EE | Teruji pengguna: chat dua arah dan reopen di kedua HP, termasuk Android 11/API 30. |
| 3 | Media E2EE, progress/error, pratinjau dan save | PR #6, #8, #10–#12 merged; CI pasca-merge #117 lulus. Picker versi sebelumnya terkonfirmasi pulih dan upload tercatat dari kedua akun. Retest privacy shield, penerima decrypt/render/save, serta uji gagal masih menunggu pada kedua HP. |
| 4 | FCM dengan payload generik dan izin Android | Belum dimulai; menunggu Fase 3 diterima. |
| 5 | WebRTC, signaling privat, TURN, caveat background | Belum dimulai. |
| 6 | Brankas terenkripsi dan log panggilan nyata | Belum dimulai. |
| 7 | Audit keamanan, akun ketiga/RLS, uji negatif dan dokumen rilis | Belum dimulai. |
| 8 | Fitur masa depan | Tidak dikerjakan kecuali diminta. |

## Gate penerimaan setiap fase

1. Unit/security-contract tests dan audit dependensi lulus.
2. Build web dan APK bertanda tangan stabil lulus.
3. Migrasi aditif ditinjau dan diverifikasi di Supabase.
4. Fitur diuji di kedua HP, termasuk Android 11/API 30.
5. Kebocoran plaintext, akun di luar pair, kesalahan jaringan, pemulihan, penguncian, dan regresi dinilai sebelum fase diterima.

**Prinsip rollout:** jangan uninstall APK untuk update biasa. Jangan reset key atau menghapus pesan lama untuk membuka fitur baru. Pilih opsi gratis; tidak menambah layanan berbayar atau meminta kartu kredit.
