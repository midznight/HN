# Our Space — Setup, Operasi, dan Rilis

**Pembaruan:** 22 Oktober 2026  
**Branch kandidat:** `phase-0.5/app-ui-implementation`  
**Branch produk:** `phase-2/e2ee-text-chat`  
**Status:** release candidate sudah dibangun dan lolos CI otomatis; **belum dinyatakan production-ready** sampai blocker Auth, push, dan pengujian dua perangkat ditutup.

Aplikasi ini dibuat untuk dua pengguna privat. Repo saat ini **public**; jangan commit password, service-role key, token, private key, keystore, data chat, atau media pribadi.

## 1. Keputusan pemilik yang tetap berlaku

- Tanggal jadian **belum ditetapkan**. Jangan menampilkan jumlah hari, countdown, atau kenangan anniversary berdasarkan tanggal prototipe lama.
- Foto/video/audio harus menampilkan **pratinjau sebelum pengiriman** dan memerlukan tindakan eksplisit **Kirim** atau **Batal**.
- Anggaran operasional Rp0. Jangan mengaktifkan layanan berbayar, membeli kredit, atau meminta kartu kredit. WebRTC saat ini memakai STUN; TURN berbayar tidak diaktifkan.
- Jangan reset pasangan, fingerprint, private key, atau riwayat pesan sebagai jalan pintas untuk upgrade.

## 2. Branch, build, dan artefak Android

- PR implementasi utama: [#25](https://github.com/midznight/HN/pull/25).
- CI: [GitHub Actions](https://github.com/midznight/HN/actions).
- Pratinjau UI statis: [Buka Our Space UI Preview](https://our-space-ui-preview-1k5bvr5jc-mi-d1.vercel.app/). Seluruh isi bertanda CONTOH; tidak terhubung ke backend dan bukan aplikasi produksi.
- Workflow Android menghasilkan artefak `our-space-debug-apk` dan `our-space-release-apk`. Rilis bertanda tangan stabil diverifikasi dengan `apksigner`; pipeline juga memeriksa application ID, versionCode/versionName, permission kamera/mikrofon, dan kecocokan sertifikat kedua varian.
- Untuk kandidat terbaru, ambil artefak hanya dari workflow Android **terbaru yang sukses**. Jangan gunakan APK dari run lama jika branch sudah berubah.
- Jangan uninstall aplikasi pada HP yang sudah digunakan. Coba pembaruan in-place hanya setelah mencadangkan informasi yang memang dapat dipulihkan. Jika Android menyatakan konflik paket/tanda tangan, **hentikan proses**; jangan hapus data atau uninstall untuk memaksa pembaruan. Kecocokan sertifikat release dengan APK lama yang sudah terpasang masih harus dikonfirmasi di kedua HP.

## 3. Status fase dan keterbatasan nyata

| Area | Status implementasi/validasi |
|---|---|
| PIN lokal dan lifecycle Android | Baseline ada; PIN lokal bukan login Supabase maupun kunci E2EE. |
| Chat teks E2EE | Pengguna sebelumnya mengonfirmasi chat dua arah dan pembukaan ulang berhasil di dua HP, termasuk Android 11/API 30. |
| Lampiran foto/video/audio | Alur dasar diterima pengguna. Pratinjau + konfirmasi wajib sebelum upload. Batas file aplikasi 3 MiB. |
| Voice note, reply, reaksi emoji | Implementasi tersedia dan kontrak otomatis lulus; pengujian alur lengkap pada kedua HP masih wajib. |
| Push FCM | Fungsi server `send-chat-push` aktif dengan verifikasi JWT. WIF/IAM/secrets dan pengujian push token nyata masih menjadi blocker; perilaku tetap fail-closed. |
| Panggilan audio/video | Implementasi WebRTC tersedia, tetapi belum diuji lintas dua perangkat/jaringan. Menggunakan STUN saja; koneksi bisa gagal pada NAT/firewall tertentu. Incoming-call saat aplikasi tertutup belum didukung. |
| Brankas terenkripsi | Modul tersedia; migrasi database sudah diterapkan, bucket media tetap privat, dan metadata/file dienkripsi di perangkat. Pengujian alur nyata dua HP masih wajib. |

Catatan keamanan E2EE: belum ada Double Ratchet/forward secrecy atau multi-device. Metadata routing (misalnya waktu, anggota pair, ukuran envelope) masih dapat terlihat server meskipun isi terenkripsi. Kehilangan private key dapat membuat riwayat lama tidak bisa dibuka; jangan reset key untuk memulihkan sesi.

## 4. Supabase: status produksi dan tindakan tersisa

Project yang digunakan aplikasi: `sajlpngmpkizwjbarxlj`.

Audit baca-saja mengonfirmasi migrasi untuk chat E2EE, media, push, Brankas, WebRTC, dan anotasi pesan sudah tercatat; tabel aplikasi mengaktifkan RLS; bucket `our-space-encrypted-media` bersifat **private**; uji simulasi subject authenticated di luar pasangan tidak melihat row aplikasi.

**Blocker Auth:** Supabase Security Advisor masih melaporkan **Leaked Password Protection disabled**. Pengaturan ini tidak tersedia melalui konektor yang dipakai saat audit, jadi belum diaktifkan. Aktifkan melalui Supabase Dashboard → Authentication/Security sebelum mengumumkan rilis publik, kemudian jalankan ulang Security Advisor.

Jangan menjalankan ulang migrasi aditif yang sudah diterapkan secara manual atau mengubah data pasangan hanya untuk membuat CI hijau. Sebelum rilis, tetap lakukan uji negatif dengan autentikasi sungguhan dan akun di luar pasangan pada database, Realtime, dan Storage.

## 5. Push notification (FCM)

Rincian arsitektur dan konfigurasi ada di [docs/FCM-WORKLOAD-IDENTITY.md](docs/FCM-WORKLOAD-IDENTITY.md).

Rilis push memerlukan Google Cloud Workload Identity Federation: pool/provider OIDC, binding IAM yang hanya memberi akses kepada identitas workflow yang dimaksud, serta secret fungsi Supabase yang benar. Tidak boleh membuat/commit private service-account JSON key. Setelah konfigurasi, uji kedua akun pada foreground, background, aplikasi ditutup normal, izin ditolak, token kedaluwarsa, dan tap notifikasi saat aplikasi terkunci. Payload tetap generik dan tidak boleh memuat plaintext, caption, nama file, atau isi media.

## 6. Checklist QA akhir pada dua HP

Item berikut tidak dapat dinyatakan selesai hanya karena build CI hijau:

1. Instal/update APK di atas versi yang sudah ada **tanpa uninstall**; konfirmasi paket dan tanda tangan cocok.
2. Pastikan Hamid dan Nur masing-masing login dengan akun sendiri, fingerprint 64 karakter cocok melalui kanal independen, dan key-mismatch memblokir percakapan.
3. Kirim/terima teks dua arah, balasan, reaksi, dan buka ulang setelah aplikasi dikunci/dibuka. Jangan merekam atau membagikan pesan privat sebagai test evidence.
4. Untuk foto/video/audio: buka galeri, kembali ke app tanpa kehilangan sesi/pilihan, tinjau media, uji Batal (tidak ada upload), lalu konfirmasi Kirim; uji error jaringan, retry, decrypt penerima, dan simpan ke galeri.
5. Untuk voice note: uji izin mikrofon ditolak, pembatalan, durasi/ukuran batas, interupsi aplikasi/telepon, serta pratinjau sebelum kirim.
6. Untuk Brankas: unggah/unduh/hapus file yang tidak sensitif, uji akun luar pair ditolak dan bucket tidak pernah bisa diakses publik.
7. Untuk panggilan: audio/video, izin ditolak, accept/reject/end, speaker/mute, jaringan Wi-Fi dan seluler, relock/background. Catat bila jaringan tidak dapat membangun koneksi STUN-only; jangan menjanjikan koneksi universal.
8. Untuk push: setelah WIF siap, uji token nyata, token kedaluwarsa, logout/revoke, izin Android ditolak, duplikasi notifikasi, dan isi notifikasi yang generik.
9. Audit terakhir tidak boleh menemukan plaintext atau private key di database, log, telemetry, atau payload push. Simpan hasil QA tanpa menyertakan konten pribadi.

## 7. Definisi siap rilis

Rilis publik baru dapat dinyatakan siap setelah semua hal berikut terbukti: CI/security-contract tests dan audit dependency lulus pada commit final; artefak release bertanda tangan stabil terverifikasi; pengaturan Auth di atas diperbaiki; WIF/FCM dikonfigurasi atau push dinyatakan nonaktif secara eksplisit dalam release notes; QA dua HP termasuk update in-place lulus; dan keterbatasan STUN-only/E2EE didokumentasikan.

Saat ini statusnya **release candidate untuk QA akhir**, bukan rilis produksi. Status tersebut sengaja tidak dinaikkan hanya berdasarkan build yang sukses.
