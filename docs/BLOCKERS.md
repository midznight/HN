# Blockers — Our Space

Pembaruan: 21 Oktober 2026.

## Blocker untuk penerimaan Fase 3

- **CI final:** run pada branch `phase-3/encrypted-media` harus hijau sampai APK assembly dengan stable signing.
- **Migration Storage produksi:** migration ada di branch dan belum dianggap aktif. Jangan aplikasikan sampai CI/tests final lulus. Setelah diterapkan, verifikasi RLS/bucket dan row pesan lama.
- **Tes dua perangkat:** belum ada bukti dari pengguna untuk upload/decrypt lampiran nyata di kedua HP; chat teks yang berhasil tidak membuktikan jalur media.
- **Voice note/video note recording:** belum masuk implementasi milestone ini; memilih file audio/video yang sudah ada saja yang sedang dibuat.
- **Batas API 23–30:** native media path harus dicoba di Android 11 karena JCA/provider/OEM dapat berbeda. CI build di runner bukan tes runtime OEM.

## Tidak boleh dilakukan untuk mengatasi blocker

- Jangan menghapus row `device_keys`, `key_verifications`, atau `messages` untuk membuat UI “lolos”.
- Jangan mempublikasikan bucket atau mengirim file asli sebelum native encryption selesai.
- Jangan memasang APK dengan tanda tangan berbeda atau menyuruh pengguna uninstall aplikasi.
- Jangan mengaktifkan layanan berbayar atau meminta kartu kredit untuk fitur ini.

Blocker harus dicatat sebagai selesai hanya setelah bukti dari CI/dashboard/perangkat tersedia.
