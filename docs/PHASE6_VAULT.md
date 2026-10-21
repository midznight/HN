# Fase 6 — Brankas terenkripsi

Status: implementasi awal; migrasi diterapkan pada Supabase produksi; menunggu CI terbaru dan tes dua HP.

## Penyimpanan

- Metadata item disimpan di public.vault_items sebagai ciphertext, nonce, key_version dan routing UUID/timestamp. Filename, MIME type, ukuran, object path, dan nonce file disimpan di dalam envelope E2EE.
- Byte file dienkripsi di native melalui metode media yang sama dengan lampiran chat; ciphertext diunggah ke bucket private our-space-encrypted-media pada path deterministik pair/user/item.bin.
- Metadata dienkripsi lewat envelope pesan dengan messageType media; file memakai konteks derivasi media/blob yang telah ada.
- RLS untuk membaca mensyaratkan membership pair dan sender/recipient; insert mensyaratkan sender = auth.uid(), pair membership, own ECDH public key, dan fingerprint peer yang telah diverifikasi. Tidak ada UPDATE policy; delete hanya oleh pengirim item.
- Daftar metadata dideskripsi di perangkat. File diunduh sebagai ciphertext kemudian didekripsi di native setelah konteks session masih valid.
- Object URL viewer/pratinjau dibersihkan saat ditutup atau aplikasi dikunci. Ukuran maksimum 3 MiB, mengikuti keterbatasan memory WebView/native.

## Lifecycle dan error

Pemilih file harus mempertahankan WebView mounted, menyembunyikan layar di task switcher, lalu mengembalikan visibilitas. Jika picker dibatalkan setelah aplikasi background, grace timeout mengunci aplikasi. Jika hapus row berhasil tetapi pembersihan Storage gagal, item tidak lagi ditampilkan dan status menjelaskan bahwa ciphertext mungkin tertinggal.

## Kriteria penerimaan

- CI terbaru lulus.
- Uji pada kedua HP untuk add → preview → save → sync → open/decrypt → delete.
- Negative tests RLS/storage lintas pair, mismatch fingerprint, object path tak cocok, media format/size invalid.
- App lock/background di setiap await tidak merender plaintext setelah lock.
- Konfirmasi bucket private dan tidak ada public URL/plaintext metadata.
- Verifikasi siklus picker galeri di Android 11/API 30 dan Android pasangan tanpa kehilangan file.
