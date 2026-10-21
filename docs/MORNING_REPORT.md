# Engineering Report — Our Space

Pembaruan: 21 Oktober 2026, 18:45 WIB.

## Baseline yang telah dikonfirmasi

Pengguna mengonfirmasi chat teks dua arah Hamid ↔ Nur dan aplikasi tetap dapat digunakan setelah ditutup/dibuka kembali. Perangkat pasangan menjalankan Android 11/API 30 dan chat teks berfungsi.

## Hasil implementasi media

- PR #6 menggabungkan lampiran gambar/video/audio terenkripsi hingga 3 MiB per file.
- File dienkripsi di native sebelum diunggah; Storage bucket tetap private dan hanya berisi ciphertext `application/octet-stream`.
- Metadata nama file, MIME, ukuran, path dan nonce ada dalam envelope pesan yang terenkripsi.
- Penerima mendekripsi/authenticate sebelum pratinjau atau simpan. API 29+ menggunakan MediaStore; API 23–28 menyimpan ke ruang dokumen privat aplikasi.
- Migration Fase 3 diterapkan dan diverifikasi pada project Supabase produksi. Pemeriksaan read-only terakhir mengonfirmasi bucket private, limit 4 MiB, dan MIME generik.
- PR #8 menambahkan penjagaan terhadap dekripsi asinkron yang selesai setelah aplikasi terkunci.
- PR #10 memperbaiki pemilih galeri agar tidak memicu PIN ulang; pengguna mengonfirmasi picker tidak lagi menghilangkan pilihan file.
- PR #11 menambahkan pemeriksaan status lock setelah dekripsi metadata dan Storage download; PR #12 menambahkan pemeriksaan setelah Blob.arrayBuffer dan shield tampilan selama picker.
- GitHub Actions #117 pada merge commit `5c9e79c2c21d63d1dcddac94ea38b6b24a49ded3` lulus, termasuk audit dependency, tes keamanan/protokol, web build, Capacitor sync dan APK assembly.
- APK hasil run #117 telah dibuat dan SHA-256 sertifikatnya cocok dengan baseline: `6E48F45D9EEEFB56FD3BC3B4ADA108FDF0B73B7280E6DF6766EF699ADAE2956D`. Update rutin tidak memerlukan uninstall.

## Snapshot backend dan batas penerimaan

Query read-only sekitar 18:44 WIB menunjukkan 21 pesan teks, 2 pesan media, 2 device keys, 2 verifikasi fingerprint dan 2 objek Storage. Masing-masing akun punya satu pesan media dengan objek cocok. Ini bukti upload/insertion server dua arah, bukan bukti penerima berhasil mendekripsi atau menyimpan.

Fase 3 **belum dinyatakan diterima**. Berikutnya: pasang APK #117 langsung di atas aplikasi berjalan, uji picker/privacy shield di kedua HP, kemudian uji gambar/audio/video dua arah sampai berhasil decrypt/render/save, termasuk Android 11/API 30. Setelah itu uji batas file, MIME salah/tidak didukung, jaringan terputus, retry, dan lock/background. Fase 4 tetap ditahan. Tidak ada reset kunci, penghapusan pesan, atau perubahan data chat untuk mengaktifkan media.
