# Engineering Report — Our Space

Tanggal: 21 Oktober 2026.

## Baseline

Pengguna mengonfirmasi chat teks dua arah dan kestabilan setelah menutup/membuka aplikasi pada kedua HP. Perangkat pasangan menjalankan Android 11/API 30 dan chat teks berfungsi.

## Pekerjaan Fase 3

- Ditambahkan jalur native encrypt/decrypt media dengan AES-256-GCM, AAD dan konteks derivasi kunci terpisah dari teks.
- Ditambahkan metadata lampiran terenkripsi di row pesan, Storage bucket private dan policy akses berbasis pair/verifikasi.
- Ditambahkan UI pemilih file gambar/video/audio, status operasi, preview setelah dekripsi, save lokal dan retry untuk lampiran yang gagal dibuka.
- Batas ukuran awal 3 MiB; file disimpan server hanya dalam ciphertext.
- Dokumentasi fitur, roadmap, keputusan, progress dan blocker diperbarui.

## Status penerimaan

Fase 3 **belum dinyatakan selesai**. Perlu CI final pada commit terbaru, penerapan/verifikasi migration, APK stabil pasca-merge dan tes media nyata pada kedua HP. Tidak ada perubahan yang bertujuan menghapus pesan lama atau memutar kunci produksi.
