# Engineering Report — Our Space

Pembaruan: 21 Oktober 2026, 18:53 WIB.

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
- PR #11/#12 menambahkan guard lock pada jalur terima dan privacy shield saat picker terbuka. PR #14 menambahkan guard setelah File.arrayBuffer pada jalur kirim, melepas referensi Base64, serta menahan error lama sesudah lock.
- GitHub Actions #124 lulus penuh pada tree yang identik dengan merge commit `44e4e5f1c9a63b35793f2d85773df354ec49afc9`, termasuk audit dependency, tes keamanan/protokol, web build, Capacitor sync dan APK assembly.
- APK hasil run #124 SHA-256: `2893ea1d9d6a4ebad786bbf44c2f9491fa7195cf39ad41ad833230fb2199aca6`; sertifikat sama dengan baseline `6E48F45D9EEEFB56FD3BC3B4ADA108FDF0B73B7280E6DF6766EF699ADAE2956D`. Update rutin tidak memerlukan uninstall.

## Snapshot backend dan batas penerimaan

Query read-only sekitar 18:44 WIB menunjukkan 21 pesan teks, 2 pesan media, 2 device keys, 2 verifikasi fingerprint dan 2 objek Storage. Masing-masing akun punya satu pesan media dengan objek cocok. Ini bukti upload/insertion server dua arah, bukan bukti penerima berhasil mendekripsi atau menyimpan.

Fase 3 kemudian diterima oleh pengguna pada 21 Oktober 2026; status terkini mengikuti persetujuan tersebut. Detail checklist teknis tetap disimpan pada docs/PHASE3_MEDIA.md sebagai jejak historis. Tidak ada reset kunci, penghapusan pesan, atau perubahan data chat untuk menyelesaikan fase.


## Pembaruan terbaru — 21 Oktober 2026

Pengguna menyatakan Fase 3 sudah aman dan memberi izin melanjutkan. Fase 4 sekarang sedang diimplementasikan dengan notifikasi FCM generik, tabel token ber-RLS owner-only, ledger dispatch service-role-only, dan Edge Function yang memverifikasi JWT pengguna, membership pair, serta verifikasi fingerprint.

Push belum aktif. CI #171 memastikan Firebase Android config di GitHub Actions sudah valid (`chatmidnur`, paket `com.ourspace.app`) dan membangun APK dengan konfigurasi tersebut. Autentikasi server memakai Workload Identity Federation tanpa service-account JSON. Push tetap nonaktif sampai Google WIF dan secrets server dikonfigurasi.


## Fase 4 — status deployment

- PR #16 telah digabung ke integration branch pada commit 16441c87c14b454ab74409a72cfbd53e71446c70.
- GitHub Actions #145 pada PR dan #146 pasca-merge lulus; audit dependency, security-contract tests, web build, Capacitor sync, serta APK bertanda tangan sukses.
- Migration Fase 4 diterapkan pada Supabase project sajlpngmpkizwjbarxlj. Pemeriksaan hanya-baca mengonfirmasi RLS aktif untuk device_push_tokens dan push_dispatches; belum ada token terdaftar dan belum ada dispatch.
- Edge Function send-chat-push berstatus ACTIVE, verify_jwt=true. Kode menerima current Supabase key environment format maupun nama legacy.
- Build #146 mencatat FIREBASE_ANDROID_CONFIG_BASE64 tidak tersedia dan karena itu sengaja membangun APK dengan push nonaktif. Jalur JSON-key lama belum digunakan; PR #22 menyediakan implementasi WIF.
- Tidak ada service berbayar atau secret yang dimasukkan ke repository/chat. Push belum dinyatakan aktif sampai kedua secret valid, build baru menghasilkan konfigurasi Firebase, dan uji push generik berhasil pada kedua HP.


## Pembaruan Fase 4 — opt-out hardening

- PR #18 merged pada commit 2c67e9ad939097fa5be79869de65a3af7f93dc57. CI #152 untuk source dan CI #153 pasca-merge lulus penuh, termasuk tes kontrak keamanan, build web, Capacitor sync, dan APK bertanda tangan stabil.
- Perbaikan mengurutkan preferensi opt-out sebelum penghapusan token server, menahan logout jika preferensi tidak dapat disimpan, dan mencoba membersihkan token sisa saat login terverifikasi berikutnya.
- Migration Fase 4 sudah diterapkan; Edge Function send-chat-push ACTIVE dengan verify_jwt=true. Belum ada token terdaftar atau dispatch.
- Build #153 mencatat Firebase client config tidak tersedia; push tetap nonaktif. PR #22 mengganti secret JSON-key dengan GOOGLE_WIF_AUDIENCE, GOOGLE_SERVICE_ACCOUNT_EMAIL, dan FCM_PROJECT_ID pada Supabase setelah WIF disiapkan. Uji dua HP tetap wajib.

## Pembaruan keyless FCM — 21 Oktober 2026

- PR #22 sudah digabung ke branch `phase-2/e2ee-text-chat`; Run CI #171 sukses pada head final. Implementasi memakai WIF dan token FCM berumur 10 menit. Tidak ada service-account key dibuat.
- Edge Function `send-chat-push` berhasil dideploy sebagai versi 2, ACTIVE, `verify_jwt=true`. CI #171 memvalidasi Firebase client config dan membangun APK bertanda tangan. Tidak ada token/dispatch yang terdaftar. Kode fail-closed sampai Google WIF, dua subject binding, dan tiga secret Supabase valid.
- Deployment function bukan bukti Google token exchange berhasil. Uji nyata masih tertunda hingga konfigurasi WIF selesai.

- Browser automation Google Cloud tidak berjalan karena saldo TinyFish wallet negatif (−US$0,264); tidak dilakukan top-up atau layanan berbayar. Setup Google Cloud pool/provider/IAM masih belum terbuat dan belum dapat diverifikasi.

## Pembaruan laporan — Fase 0.5, Fase 5 dan Fase 6 (21 Oktober 2026)

### Yang sudah diterapkan di branch implementasi
- UI tiga tab dan halaman awal chat setelah PIN; kartu “Ruang Kita” tidak mengarang tanggal jadian; zoom dan reduce-motion dihormati.
- Pratinjau sebelum kirim media di chat dan pratinjau sebelum simpan media ke Brankas.
- Brankas E2EE memakai bucket privat dan tabel vault_items dengan RLS, plus sinkronisasi daftar via Realtime. Migrasi sudah diterapkan pada project produksi; file SQL kembar tersimpan di repo.
- Panggilan suara/video WebRTC tahap awal dengan signaling dan riwayat ciphertext, RLS pair/fingerprint, timeout, lock teardown dan panggilan history cards di timeline chat.
- Tes kontrak baru untuk alur media, navigasi tiga tab, skema Brankas ciphertext-only, dan skema signaling/history panggilan.
- CI dan Android workflow kini memicu branch fase 0.5. Audit dependency produksi, syntax, tests dan build harus diperiksa pada run terbaru.

### Batas yang masih nyata
- Panggilan hanya menggunakan STUN; konektivitas di jaringan yang membutuhkan TURN belum dipastikan. Panggilan masuk/background dan uji OEM belum ada.
- Belum ada uji Brankas/call di dua perangkat pada implementasi baru; baseline chat/media sebelumnya punya penerimaan pengguna.
- Push FCM tetap fail-closed sampai Google WIF dan secrets valid serta tes dua HP selesai.
- Supabase Auth leaked-password protection masih dilaporkan disabled oleh Security Advisor; aktifkan dari dashboard sebelum rilis publik.
- Build APK signed stabil terbaru dan update in-place belum diverifikasi pada kedua perangkat. Tidak boleh uninstall atau reset key untuk mengatasi blocker.
- Status rilis: kandidat implementasi/QA, belum “production ready”.

## Pembaruan lanjutan — voice note/reaction/reply (21 Oktober 2026)

- Media recorder lokal tersedia dengan limit konservatif dan tidak auto-send.
- Reply link dan emoji reactions diimplementasikan melalui E2EE table message_annotations, tanpa mengubah format pesan teks lama.
- Call foreground resume mencoba memproses sinyal yang baru diterima tetapi belum ditangani; offer usang tetap dibatasi oleh TTL.
- Font web bundle dipangkas menjadi tiga weight.
- Web CI pernah sukses pada commit sebelumnya; pekerjaan setelahnya tetap perlu menunggu CI dan Android build di HEAD. APK/install in-place, dua HP, push WIF, Auth leaked-password protection, dan TURN untuk konektivitas panggilan universal belum terverifikasi.

