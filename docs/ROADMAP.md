# Our Space — Roadmap Operasional

Roadmap ini melengkapi ARCHITECTURE.md. Perubahan fase tidak otomatis berarti penerimaan selesai.

| Fase | Ruang lingkup | Status per 21 Oktober 2026 |
|---|---|---|
| 0 | Fondasi konsep, batas keamanan, pemilihan layanan gratis | Fondasi dan prasyarat sudah didokumentasikan |
| 0.5 | **Redesain UI/UX Android, alur, desain sistem, dan pratinjau statis** | **Sedang ditinjau; harus mendapat persetujuan pengguna sebelum Fase 1** |
| 1 | Capacitor shell, PIN lokal, lifecycle Android, APK | Baseline implementasi tersedia; UI baru belum diterapkan |
| 2 | Supabase Auth, key binding, fingerprint, chat teks E2EE | Teruji pengguna: chat dua arah dan reopen di kedua HP, termasuk Android 11/API 30 |
| 3 | Media E2EE, progress/error, pratinjau dan save | Diterima pengguna pada 21 Oktober 2026; fitur perekaman voice/video note belum ada |
| 4 | FCM dengan payload generik dan izin Android | Implementasi ter-deploy, tetapi aktivasi menunggu Google Workload Identity Federation serta pengujian dua HP |
| 5 | WebRTC, signaling privat, TURN, caveat background | Belum dimulai; panggilan di pratinjau hanya simulasi |
| 6 | Brankas terenkripsi dan log panggilan nyata | Belum dimulai; angka kuota/media di pratinjau adalah CONTOH |
| 7 | Audit keamanan, akun ketiga/RLS, uji negatif dan dokumen rilis | Belum dimulai |
| 8 | Fitur masa depan | Tidak dikerjakan kecuali diminta |

## Gate penerimaan setiap fase

1. Unit/security-contract tests dan audit dependensi lulus.
2. Build web dan APK bertanda tangan stabil lulus.
3. Migrasi aditif ditinjau dan diverifikasi di Supabase.
4. Fitur diuji di kedua HP, termasuk Android 11/API 30.
5. Kebocoran plaintext, akun di luar pair, kesalahan jaringan, pemulihan, penguncian, dan regresi dinilai sebelum fase diterima.
6. Fase desain 0.5 mempunyai gate tambahan: pratinjau dan DESIGN.md ditinjau oleh pengguna. Jangan mengimplementasikan redesign ke APK sampai pengguna menulis “lanjut” atau memberikan revisi yang jelas.

**Prinsip rollout:** jangan uninstall APK untuk update biasa. Jangan reset key atau menghapus pesan lama untuk membuka fitur baru. Pilih opsi gratis; tidak menambah layanan berbayar atau meminta kartu kredit.
