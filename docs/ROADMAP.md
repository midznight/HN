# Our Space — Roadmap Operasional

Roadmap ini melengkapi `ARCHITECTURE.md`; perubahan fase tidak otomatis berarti penerimaan selesai.

| Fase | Ruang lingkup | Status per 21 Oktober 2026 |
|---|---|---|
| 1 | Capacitor shell, PIN lokal, lifecycle Android, APK | Baseline tersedia; APK sudah dipakai pengguna. |
| 2 | Supabase Auth, key binding, fingerprint, chat teks E2EE | Teruji pengguna: chat dua arah dan reopen di kedua HP, termasuk Android 11/API 30. |
| 3 | Media E2EE, progress/error, pratinjau dan save | Diterima oleh pengguna pada 21 Oktober 2026. Detail implementasi dan batas teknis ada di docs/PHASE3_MEDIA.md. |
| 4 | FCM dengan payload generik dan izin Android | PR #16 merged, CI #146 lulus, migration applied, Edge Function send-chat-push ACTIVE dengan verify_jwt=true. Aktivasi menunggu FIREBASE_ANDROID_CONFIG_BASE64 di GitHub dan FCM_SERVICE_ACCOUNT_JSON di Supabase, lalu uji dua HP. |
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
