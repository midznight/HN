# Blockers — Our Space

Pembaruan: 21 Oktober 2026, 18:53 WIB.

## Blocker untuk penerimaan Fase 3

- **Uji penerimaan media pada perangkat nyata masih wajib.** Backend menunjukkan satu pesan media dan objek Storage yang cocok dari masing-masing akun, namun penerima yang berhasil mendekripsi, menampilkan dan menyimpan file belum dikonfirmasi.
- **Retest privacy shield & sender guard.** APK #124 menyembunyikan konten selama picker, memeriksa lock setelah pembacaan file sebelum enkripsi, dan menahan error lama setelah lock. Uji pembaruan ini di kedua HP; picker yang dikonfirmasi sebelumnya adalah build sebelum shield.
- **Pemasangan APK sebagai update.** Sertifikat APK #117 cocok dengan baseline. Pasang langsung tanpa uninstall; jika Android menampilkan signature mismatch, hentikan dan laporkan pesannya.
- **Uji Android 11/API 30.** Chat teks sudah dikonfirmasi pada API 30; jalur media harus diuji secara khusus pada perangkat tersebut.
- **Skenario kegagalan media.** Batas 3 MiB, MIME unsupported, jaringan terputus, retry unduh/dekripsi, simpan lokal, dan lock ketika operasi berjalan belum dilaporkan lulus oleh pengguna.

## Sudah tidak memblokir tahap build

- CI PR #14 (#124) berhasil penuh. Tree kode commit build identik dengan tree merge commit utama `44e4e5f1c9a63b35793f2d85773df354ec49afc9`.
- Migration Fase 3 sudah diterapkan dan diverifikasi.
- Bucket Storage privat dan policy akses terpasang.
- APK baru tersedia dan sertifikat cocok dengan APK baseline yang diperiksa.

## Tidak boleh dilakukan untuk mengatasi blocker

- Jangan hapus row `device_keys`, `key_verifications`, atau `messages` untuk membuat UI “lolos”.
- Jangan publikasikan bucket, unggah file asli, atau menaruh plaintext/kunci di log.
- Jangan menyarankan uninstall untuk update rutin.
- Jangan mengaktifkan layanan berbayar atau meminta kartu kredit.

Fase 3 tetap berstatus **menunggu uji perangkat** sampai hasil nyata dua arah dicatat. Fase 4 jangan dimulai sebelum gate ini lulus.
