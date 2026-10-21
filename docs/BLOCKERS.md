# Blockers — Our Space

Pembaruan: 21 Oktober 2026, 17:44 WIB.

## Blocker untuk penerimaan Fase 3

- **Uji penerimaan media pada perangkat nyata masih wajib.** Snapshot backend read-only menemukan satu pesan media dan objek Storage yang cocok dari masing-masing akun, sehingga upload/insert dua arah sudah terbukti di server. Penerima yang berhasil mendekripsi, menampilkan dan menyimpan file pada kedua HP masih perlu dikonfirmasi.
- **Pemasangan APK sebagai update.** Perbaikan galeri sudah diuji pengguna. Tetap gunakan update langsung tanpa uninstall; jika Android menampilkan signature mismatch, hentikan dan laporkan pesannya.
- **Uji Android 11/API 30.** Chat teks sudah dikonfirmasi pada API 30; jalur media harus diuji secara khusus pada perangkat tersebut.
- **Skenario kegagalan media.** Batas 3 MiB, MIME unsupported, jaringan terputus, retry unduh/dekripsi, simpan lokal, dan lock ketika operasi berjalan belum dilaporkan lulus oleh pengguna.

## Sudah tidak memblokir tahap build

- CI post-merge #101 dan CI PR #11 (#109) sukses, termasuk tes kontrak keamanan dan APK build.
- Migration Fase 3 sudah diterapkan dan diverifikasi.
- Bucket Storage privat dan policy akses terpasang.
- APK baru tersedia dan sertifikat cocok dengan APK baseline yang diperiksa.

## Tidak boleh dilakukan untuk mengatasi blocker

- Jangan hapus row `device_keys`, `key_verifications`, atau `messages` untuk membuat UI “lolos”.
- Jangan publikasikan bucket, unggah file asli, atau menaruh plaintext/kunci di log.
- Jangan menyarankan uninstall untuk update rutin.
- Jangan mengaktifkan layanan berbayar atau meminta kartu kredit.

Fase 3 tetap berstatus **menunggu uji perangkat** sampai hasil nyata dua arah dicatat. Fase 4 jangan dimulai sebelum gate ini lulus.
