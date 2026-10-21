# Fase 3 — Lampiran Media E2EE

Status: implementasi awal pada branch `phase-3/encrypted-media`. Migration sudah diterapkan dan diverifikasi di produksi; CI build kode media telah lulus pada run #75/#76/#79. Fase belum diterima sampai run terbaru terkonfirmasi dan tes langsung antarperangkat selesai.

## Cakupan milestone ini

- Memilih satu file yang sudah ada melalui Android picker: gambar, video atau audio.
- Maksimum file sumber 3 MiB agar pemrosesan Base64/native tetap terbatas pada ponsel.
- Enkripsi dilakukan pada perangkat di native plugin sebelum upload.
- File disimpan di bucket privat `our-space-encrypted-media` sebagai byte ciphertext dengan content type generik `application/octet-stream`.
- Metadata (nama file, MIME type, ukuran, path dan nonce media) diserialisasi lalu dienkripsi ke kolom `messages.ciphertext`; tabel hanya menyatakan jenis umum `media`.
- Penerima mengunduh ciphertext melalui sesi Supabase terautentikasi, lalu native melakukan verifikasi AES-GCM/dekripsi sebelum pratinjau atau simpan lokal.
- UI menampilkan tahap proses, kesalahan upload, preview media, tombol Simpan ke perangkat, dan Coba lagi saat unduh/dekripsi gagal.

Belum termasuk perekaman voice note/video note, thumbnail, kompresi, progress persentase per byte, multi-file per pesan atau galeri native khusus.

## Format dan derivasi kunci

- Shared secret: ECDH P-256 memakai identitas lokal dan public key pasangan.
- Derivasi: HKDF berbasis HMAC-SHA-256 dengan pemisahan konteks menurut arah dan tipe konten.
- Isi media dibungkus sebagai envelope berversi yang berisi magic/version, panjang nama, panjang MIME, panjang bytes, nama, MIME dan bytes asli.
- Enkripsi: AES-256-GCM dengan nonce acak 96-bit. AAD mengikat pair ID, message ID, sender, recipient, key version dan konteks `media/blob`.
- Metadata menggunakan konteks terpisah `media`; tidak boleh memakai kunci AES yang sama dengan payload media.
- GCM authentication harus sukses sebelum bytes ditampilkan. Jika gagal, isi tidak ditampilkan.

## Storage dan kebijakan akses

Bucket harus tetap **private**. RLS storage membatasi SELECT untuk anggota pair, INSERT untuk anggota yang sudah memiliki kunci sendiri dan memiliki catatan verifikasi fingerprint pasangan yang cocok, serta DELETE hanya untuk objek orphan yang belum memiliki row pesan. Sesudah row pesan tercatat, objek tidak boleh dihapus klien. Storage menyimpan ciphertext, bukan media asli.

Object path saat ini berbentuk `pair_uuid/sender_uuid/message_uuid.bin`. Path merupakan metadata routing yang terbatas; nama asli, MIME asli dan nonce media berada dalam metadata yang dienkripsi dalam row pesan. Ukuran ciphertext tetap dapat terlihat oleh penyedia storage.

## Urutan rollout dan status

1. [x] `npm test`, dependency audit, Vite build, dan Gradle `assembleDebug` lulus pada commit kode media yang diuji CI.
2. [x] Tinjau migration `supabase/migrations/20261021170000_phase3_encrypted_media.sql`.
3. [x] Migration aditif diterapkan ke project `sajlpngmpkizwjbarxlj`; tidak ada row pesan/key yang diubah dan fingerprint tidak dirotasi.
4. [x] Verifikasi bucket private, limit 4 MiB untuk ciphertext, allowed MIME generic, constraint pesan dan policy RLS Storage. Jumlah row lama tetap sama.
5. [ ] Setelah PR merge, ambil APK stabil baru dan pasang sebagai update tanpa uninstall pada kedua HP.
6. [ ] Tes gambar, audio, video; uji file tidak didukung/lebih dari 3 MiB, jaringan terputus, upload berhasil tapi insert row gagal, dekripsi rusak, lock/background, retry dan save lokal.
7. [ ] Tes akses Storage dengan akun di luar pair. Akun ketiga harus ditolak.

## Keamanan dan batas

Private key tidak dikirim ke JavaScript/server. Namun browser WebView perlu memegang bytes file sementara saat file dipilih dan melewatkan Base64 ke plugin native; bytes dan string immutable di memori tidak bisa dijamin terhapus sempurna dari heap. Jangan menyebutnya secure deletion. Pada API 23–30, ECDH private key dilindungi at-rest oleh AES-GCM key dari Android Keystore, tetapi sementara dibuka di native memory; jaminan lebih rendah daripada API 31+.

Fase belum dinyatakan selesai hanya karena CI hijau. Verifikasi nyata antara kedua HP diperlukan sebelum pengguna menyimpan media pribadi.
