# Fase 3 — Voice Note, Balasan dan Reaksi Emoji

Status: implementasi awal pada branch phase-0.5/app-ui-implementation. CI terbaru dan uji dua perangkat harus lulus sebelum dianggap diterima.

## Voice note

- Menggunakan MediaRecorder dari WebView Android dan permintaan izin mikrofon yang eksplisit.
- Durasi maksimal 90 detik. Rekaman dihentikan sebelum mencapai batas 3 MiB agar memberi ruang untuk chunk audio terakhir.
- Rekaman ditahan sementara di memori perangkat; tidak masuk ke Storage/Database ketika tombol rekam ditekan.
- Setelah selesai, File lokal dibuka di dialog pratinjau yang sama dengan lampiran biasa. Hanya tombol Kirim media yang memulai pipeline enkripsi dan upload.
- Batal menutup dialog tanpa upload. Saat app terkunci, sesi perekaman dihentikan, track mikrofon dilepas dan buffer chunk dibuang best-effort.
- Jika WebView tidak mendukung MediaRecorder atau izin ditolak, UI menjelaskan sebab dan menawarkan picker file audio.

## Reply link dan emoji

- Pesan teks lama tidak diubah menjadi JSON; isi chat existing tetap kompatibel.
- Reply link dan reaction memakai tabel terpisah message_annotations. ID pesan target, ID balasan, emoji, dan active/inactive state ada di JSON envelope yang dienkripsi dengan native KeyStore sebelum database menerima.
- Kolom server hanya ID anotasi, pair/sender/recipient, ciphertext, nonce, key version dan timestamp. Tidak ada kolom plaintext untuk target, emoji, quote atau body.
- Setiap insert mensyaratkan sender = auth.uid(), pair membership, own ECDH-P256 key dan fingerprint public key pasangan yang diverifikasi.
- Reaction append-only: toggle membuat event ciphertext active/inactive baru, tidak melakukan UPDATE plaintext. Quote balasan didekripsi lokal dan dapat digulir kembali ke pesan target jika masih dimuat.
- Realtime + initial fetch menyinkronkan anotasi; anotasi salah kunci atau tidak valid tidak dirender. Tampilan/target anotasi dibersihkan ketika app terkunci.

## QA wajib

1. Rekam voice note dengan izin diberikan/ditolak, tekan selesai, batas durasi/ukuran, cancel preview, confirm send, app lock dan gallery picker.
2. Kirim voice note dari HP A ke B, buka, simpan ke galeri, cek format MIME di kedua perangkat.
3. Tambah/toggle reaksi tiap emoji, koneksi terputus, reload, dua pihak mengubah reaksi sama, pesan media dan item lama.
4. Balas pesan teks/media, batalkan konteks, tap kutipan untuk lompat ke target, target tidak dimuat, request anotasi gagal.
5. Uji negative RLS, ciphertext salah, nonce atau version tidak valid, akun luar pair dan app lock saat decrypt/insert in-flight.

Jangan menandai fase selesai hanya karena unit/kontrak test lewat. Uji dua perangkat dan kompatibilitas APK tetap wajib.
