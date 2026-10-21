# Engineering Report — Our Space

Tanggal: 21 Oktober 2026.

## Baseline

Pengguna mengonfirmasi chat teks dua arah dan kestabilan setelah menutup/membuka aplikasi pada kedua HP. Perangkat pasangan menjalankan Android 11/API 30 dan chat teks berfungsi.

## Pekerjaan Fase 3

- Ditambahkan jalur native encrypt/decrypt media dengan AES-256-GCM, AAD dan konteks derivasi kunci terpisah dari teks.
- Ditambahkan metadata lampiran terenkripsi di row pesan, Storage bucket private dan policy akses berbasis pair/verifikasi.
- Ditambahkan UI pemilih file gambar/video/audio, status operasi, preview setelah dekripsi, save melalui native Android Storage API, dan retry untuk lampiran yang gagal dibuka. API 29+ memakai MediaStore; API 23–28 menyimpan ke ruang file privat aplikasi.
- Batas ukuran awal 3 MiB; file disimpan server hanya dalam ciphertext.
- Dokumentasi fitur, roadmap, keputusan, progress dan blocker diperbarui.
- Migration Fase 3 diterapkan ke Supabase produksi dan diverifikasi: bucket private, ukuran maksimum 4 MiB, MIME generic, constraint media aktif, dan policy Storage sudah ada.
- Verifikasi data setelah migration: 2 pesan teks lama tetap ada, 0 pesan media, 2 device keys, 2 verifikasi. Tidak ada row key/pesan diubah.
- CI build/test untuk kode media sudah lulus pada run #75, #76 dan #79; run #80 setelah dokumentasi masih perlu konfirmasi.

## Status penerimaan

Fase 3 **belum dinyatakan selesai**. Yang tersisa: konfirmasi CI commit terbaru, merge PR, build APK stabil pasca-merge, dan tes media nyata pada kedua HP termasuk Android 11/API 30. Tidak ada perubahan yang bertujuan menghapus pesan lama atau merotasi kunci produksi.
