# Fase 3 — Lampiran Media E2EE

Status: implementasi awal digabung melalui [PR #6](https://github.com/midznight/HN/pull/6); hardening dekripsi saat lock melalui [PR #8](https://github.com/midznight/HN/pull/8); picker melalui [PR #10](https://github.com/midznight/HN/pull/10); guard metadata/buffer dan privacy shield melalui [PR #11](https://github.com/midznight/HN/pull/11) serta [PR #12](https://github.com/midznight/HN/pull/12). Migration diterapkan dan diverifikasi; GitHub Actions #117 pasca-merge lulus. Pengguna mengonfirmasi picker versi sebelumnya kembali tanpa PIN ulang dan file tetap ada. Snapshot backend read-only menunjukkan satu pesan media dan objek Storage yang cocok dari setiap akun. Retest privacy shield dan penerimaan decrypt/render/save masih wajib.

## Cakupan milestone ini

- Memilih satu file yang sudah ada melalui Android picker: gambar, video atau audio.
- Maksimum file sumber 3 MiB agar pemrosesan Base64/native tetap terbatas pada ponsel.
- Enkripsi dilakukan pada perangkat di native plugin sebelum upload.
- File disimpan di bucket privat `our-space-encrypted-media` sebagai byte ciphertext dengan content type generik `application/octet-stream`.
- Metadata (nama file, MIME type, ukuran, path dan nonce media) diserialisasi lalu dienkripsi ke kolom `messages.ciphertext`; tabel hanya menyatakan jenis umum `media`.
- Penerima mengunduh ciphertext melalui sesi Supabase terautentikasi, lalu native melakukan verifikasi AES-GCM/dekripsi sebelum pratinjau atau simpan lokal.
- UI menampilkan tahap proses upload, kesalahan upload, preview media, dan Coba lagi saat unduh/dekripsi gagal.
- Tombol **Simpan ke Galeri** memanggil penyimpanan native. Android 10/API 29+ menulis lewat MediaStore ke Pictures/Movies/Music/Our Space tanpa meminta izin penyimpanan bersama; API 23–28 memakai folder Documents/Our Space dalam ruang file aplikasi.

Belum termasuk perekaman voice note/video note, thumbnail, kompresi, progress persentase per byte, multi-file per pesan atau galeri native khusus.

## Format dan derivasi kunci

- Shared secret: ECDH P-256 memakai identitas lokal dan public key pasangan.
- Derivasi: HKDF berbasis HMAC-SHA-256 dengan pemisahan konteks menurut arah dan tipe konten.
- Isi media dibungkus sebagai envelope berversi yang berisi magic/version, panjang nama, panjang MIME, panjang bytes, nama, MIME dan bytes asli.
- Enkripsi: AES-256-GCM dengan nonce acak 96-bit. AAD mengikat pair ID, message ID, sender, recipient, key version dan konteks `media/blob`.
- Metadata menggunakan konteks terpisah `media`; tidak boleh memakai kunci AES yang sama dengan payload media.
- GCM authentication harus sukses sebelum bytes ditampilkan. Jika gagal, isi tidak ditampilkan.

## Storage dan kebijakan akses

Bucket harus tetap **private**. RLS Storage membatasi SELECT untuk anggota pair, INSERT untuk anggota yang sudah memiliki kunci sendiri dan memiliki catatan verifikasi fingerprint pasangan yang cocok, serta DELETE hanya untuk objek orphan yang belum memiliki row pesan. Sesudah row pesan tercatat, objek tidak boleh dihapus klien. Storage menyimpan ciphertext, bukan media asli.

Object path saat ini berbentuk `pair_uuid/sender_uuid/message_uuid.bin`. Path merupakan metadata routing yang terbatas; nama asli, MIME asli dan nonce media berada dalam metadata yang dienkripsi dalam row pesan. Ukuran ciphertext tetap dapat terlihat oleh penyedia storage.

## Urutan rollout dan status

1. [x] CI pasca-merge #117: dependency audit, deterministic tests, Vite build, Capacitor sync, Gradle APK assembly dan upload artifact sukses.
2. [x] Migration `supabase/migrations/20261021170000_phase3_encrypted_media.sql` diterapkan ke project `sajlpngmpkizwjbarxlj`.
3. [x] Read-only check: bucket private, limit 4 MiB, MIME generik, constraint `message_type` dan policy Storage terpasang.
4. [x] PR #8 menambahkan regression test untuk memastikan hasil decrypt tidak dirender setelah app lock.
5. [x] APK pasca-merge dibuat; sertifikat penandatanganannya cocok dengan baseline API 30 yang diperiksa.
6. [x] Perbaikan picker PR #10 digabung, CI lulus, dan pengguna mengonfirmasi kembali tanpa PIN ulang serta file terpilih tidak hilang pada versi sebelum shield.
7. [x] PR #11/#12 menambahkan guard setelah dekripsi metadata, Storage download dan Blob.arrayBuffer; konten aplikasi disembunyikan selama picker sistem terbuka. CI pasca-merge #117 lulus.
8. [x] Snapshot backend read-only: satu pesan media dari Hamid dan satu dari Nur, masing-masing memiliki objek Storage yang cocok. Ini membuktikan upload/insert dua arah saja.
9. [ ] Uji build #117 pada kedua HP: buka picker, pilih file, pastikan konten kembali dengan benar setelah selection dan tidak ada permintaan PIN berulang.
10. [ ] Uji di perangkat penerima bahwa gambar, audio, video dapat diunduh, didekripsi, dipratinjau dan disimpan di kedua arah.
11. [ ] Uji file di atas 3 MiB/MIME unsupported, jaringan terputus, retry unduh/dekripsi, lock/background dan Simpan ke Galeri.
12. [ ] Catat hasil pada Android 11/API 30 sebelum menyatakan fase diterima.

## Keamanan dan batas

Private key tidak dikirim ke JavaScript/server. Namun browser WebView perlu memegang bytes file sementara saat file dipilih dan melewatkan Base64 ke plugin native; bytes dan string immutable di memori tidak bisa dijamin terhapus sempurna dari heap. Jangan menyebutnya secure deletion. Pada API 23–30, ECDH private key dilindungi at-rest oleh AES-GCM key dari Android Keystore, tetapi sementara dibuka di native memory; jaminan lebih rendah daripada API 31+.

Fase belum dinyatakan selesai hanya karena CI hijau. Verifikasi nyata antara kedua HP diperlukan sebelum pengguna menyimpan media pribadi.
