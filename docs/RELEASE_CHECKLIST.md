# Our Space — Checklist Rilis

Tanggal pembaruan: 21 Oktober 2026  
Status: **belum siap rilis produksi** sampai blocker wajib ditutup. Checklist ini bukan persetujuan manual; setiap item harus punya bukti yang bisa diperiksa.

## A. Source dan review

- [ ] PR implementasi UI/Brankas/WebRTC ditinjau; tidak merge ke main (yang bukan branch produk) dan tidak merge ke branch baseline sebelum CI/safe review.
- [ ] CI terbaru pada HEAD menyelesaikan dependency audit, syntax, semua unit/security-contract tests, build web dan verifikasi artefak.
- [ ] Android workflow menghasilkan APK bertanda tangan keystore stabil; periksa versionCode, versionName, package name dan APK metadata.
- [ ] Catat commit SHA sumber APK. Artifact harus berasal dari SHA yang sama dengan hasil QA.

## B. Supabase dan keamanan

- [x] Fase 2 chat E2EE dan Fase 3 media: migrasi tersedia dan diterapkan di project sajlpngmpkizwjbarxlj.
- [x] Fase 6 vault_items dan Realtime publication: migration diterapkan; row menyimpan ciphertext, RLS membatasi pair/verified sender.
- [x] Fase 5 call_signals/call_records dan Realtime publication: migration diterapkan; SDP/history terenkripsi dan akses dibatasi.
- [ ] Jalankan uji negatif RLS untuk akun di luar pair, recipient yang salah, key fingerprint berbeda, key_version tidak didukung, row/objek ID palsu, dan Storage path lintas pengguna.
- [ ] Pastikan objek di bucket tetap private; jangan gunakan public URL/signed URL permanen untuk file.
- [ ] Perbaiki atau secara formal terima temuan Security Advisor. Proteksi password bocor Auth saat ini dilaporkan disabled; aktifkan di dashboard sebelum rilis publik.
- [ ] Jangan mengubah atau menghapus key binding, private key, pesan lama, atau membership demi membuat tes lulus.

## C. Uji dua perangkat Android

- [ ] Upgrade APK in-place pada kedua HP tanpa uninstall; tanda tangan harus identik dan pesan/fingerprint lama tetap tersedia.
- [ ] Login PIN dan buka ke Obrolan; uji lock/unlock, aplikasi masuk background, Android Back, keyboard dan safe area.
- [ ] Chat E2EE dua arah, reconnect, offline/error, pesan gagal didekripsi, dan perbedaan fingerprint.
- [ ] Voice note: izin mikrofon grant/deny, stop manual/limit durasi/limit 3 MiB, preview/cancel/confirm, lock selama rekaman dan sinkronisasi file audio ke perangkat pasangan.
- [ ] Reaksi emoji: tambah/toggle, dua pengguna pada emoji yang sama, reaksi lintas perangkat/reconnect, pesan media, lock ketika request in-flight, invalid ciphertext dan tabel annotation tanpa plaintext.
- [ ] Balasan: pilih target teks/media, batal pemilihan reply, kirim balasan, klik kutipan ke pesan target, gagal tulis annotation, dan target yang tidak lagi dimuat.
- [ ] Picker gambar/video/audio: pemilihan → pratinjau → Kirim; Batal tidak mengirim; file tetap dipilih sesudah kembali dari galeri; batas 3 MiB dan tipe yang ditolak.
- [ ] Brankas: pilih file, pratinjau, simpan, lihat dari HP pasangan, buka/dekripsi, tutup viewer, hapus, koneksi gagal, picker dibatalkan, app terkunci selama operasi. Verifikasi tidak ada plaintext/metadata file di database.
- [ ] Panggilan audio/video: permission grant/deny, answer/reject, timeout, mute/camera, speaker/audio routing, network loss, app lock/background, stop mic/kamera, history card dan sinyal ganda.
- [ ] Tes panggilan dari Wi-Fi berbeda dan jaringan seluler. Catat kegagalan NAT; TURN belum dikonfigurasi sehingga panggilan mungkin tidak dapat tersambung pada beberapa jaringan.
- [ ] FCM: baru tandai aktif setelah WIF berhasil, token nyata diperoleh, push generik tiba dua arah, tidak ada isi plaintext, revoke/logout dan error negatif lulus.

## D. Pengaturan eksternal wajib

- [ ] Google Cloud WIF provider/subject bindings yang membatasi hanya dua identitas telah dikonfigurasi, IAM minimum, dan tiga secrets function valid. Jangan membuat service-account JSON private key sebagai shortcut.
- [ ] Supabase Auth leaked-password protection diaktifkan/verifikasi.
- [ ] Keystore signing stabil dan nilai secret tersedia pada GitHub Actions. Jangan menyimpan berkas keystore/password di repo.

## E. Keputusan perilisan

- [ ] Tidak ada severity tinggi pada dependency/security review tanpa mitigasi tercatat.
- [ ] Tidak ada masalah blocker dalam percakapan dua arah, fingerprint, media, vault, atau panggilan yang tidak ditangani fail-closed.
- [ ] Semua keterbatasan yang masih ada ditulis dalam release notes.
- [ ] Rilis diberi nomor versi, tag/release notes, artifact APK, sumber SHA, hasil tes, dan prosedur rollback.
- [ ] Pastikan tidak menambahkan layanan berbayar atau meminta metode pembayaran; anggaran proyek Rp0.

**Aturan:** jika ada checkbox wajib yang belum terbukti, rilis produksi ditahan. CI hijau saja tidak cukup.
