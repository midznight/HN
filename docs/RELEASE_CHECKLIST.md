# Our Space — Checklist Rilis

Tanggal pembaruan: 22 Oktober 2026  
Status: **kandidat rilis (RC), belum siap rilis produksi** sampai blocker wajib ditutup. Checklist ini bukan permintaan persetujuan bertahap; setiap item wajib punya bukti yang bisa diperiksa.

## A. Source dan review

- [x] PR #25 ditinjau untuk integrasi otomatis dan digabung ke branch produk `phase-2/e2ee-text-chat` (commit `f2e2ebf`). Tidak ada merge ke `main`.
- [x] CI pada merge commit `f2e2ebf` lulus: [run #117](https://github.com/midznight/HN/actions/runs/39692713355) menyelesaikan dependency audit, syntax, unit/security-contract tests dan build web.
- [x] Android workflow pada merge commit sukses: [run #243](https://github.com/midznight/HN/actions/runs/39692713328) membangun debug + release APK, memverifikasi versionCode `243`, versionName `0.1.243`, package `com.ourspace.app`, permission dan kecocokan tanda tangan.
- [x] Catat sumber binary: commit `f2e2ebfcefba35b6df0b9e788b876cd778e94c50`, tree `ece5aef3b6ee3f53abc9a7955c1e25ce2b97c9c8`. APK SHA-256 `9b2b6549cb5da6216d729739beddfabd395e7906f3e95c9b456229e7324ce007`; perangkat nyata belum QA sehingga status tetap RC.

## Hasil otomatis terbaru

- CI branch produk pada merge commit lulus: [run #117](https://github.com/midznight/HN/actions/runs/39692713355).
- Android release workflow branch produk lulus: [run #243](https://github.com/midznight/HN/actions/runs/39692713328). Sertifikat SHA-256 `6e48f45d9eeefb56fd3bc3b4ada108fdf0b73b7280e6df6766ef699adae2956d`; APK release SHA-256 `9b2b6549cb5da6216d729739beddfabd395e7906f3e95c9b456229e7324ce007`.

## B. Supabase dan keamanan

- [x] Fase 2 chat E2EE dan Fase 3 media: migrasi tersedia dan diterapkan di project sajlpngmpkizwjbarxlj.
- [x] Fase 6 vault_items dan Realtime publication: migration diterapkan; row menyimpan ciphertext, RLS membatasi pair/verified sender.
- [x] Fase 5 call_signals/call_records dan Realtime publication: migration diterapkan; SDP/history terenkripsi dan akses dibatasi.
- [ ] Jalankan uji negatif RLS untuk akun di luar pair, recipient yang salah, key fingerprint berbeda, key_version tidak didukung, row/objek ID palsu, dan Storage path lintas pengguna.
- [x] Audit baca-saja mengonfirmasi bucket `our-space-encrypted-media` `public=false`; policy upload/download mengunci objek ke anggota pasangan dan path `.bin`. Jangan gunakan public URL/signed URL permanen untuk file.
- [x] Simulasi role `authenticated` dengan subject di luar pair tidak dapat membaca row dari delapan tabel aplikasi. Ini bukan pengganti tes token/jaringan negatif penuh di dua perangkat.
- [x] Batas Auth ditinjau: **Leaked Password Protection hanya tersedia pada Supabase Pro+** ([dokumen resmi](https://supabase.com/docs/guides/auth/password-security)). Tidak upgrade karena budget Rp0. Catat residual risk untuk penggunaan privat dua akun; sebelum dipakai, verifikasi password kedua akun kuat/unik dan public sign-up off. Warning tetap ada; bukan klaim bahwa fitur telah aktif.
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
- [x] Supabase Free-plan limitation dicatat sebagai residual risk dan tidak menambah biaya. (Password leak-check tidak aktif; lihat keputusan Auth di atas.)
- [ ] Keystore signing stabil dan nilai secret tersedia pada GitHub Actions. Jangan menyimpan berkas keystore/password di repo.

## E. Keputusan perilisan

- [ ] Tidak ada severity tinggi pada dependency/security review tanpa mitigasi tercatat.
- [ ] Tidak ada masalah blocker dalam percakapan dua arah, fingerprint, media, vault, atau panggilan yang tidak ditangani fail-closed.
- [ ] Semua keterbatasan yang masih ada ditulis dalam release notes.
- [ ] Rilis diberi nomor versi, tag/release notes, artifact APK, sumber SHA, hasil tes, dan prosedur rollback.
- [ ] Pastikan tidak menambahkan layanan berbayar atau meminta metode pembayaran; anggaran proyek Rp0.

**Aturan:** jika ada checkbox wajib yang belum terbukti, rilis produksi ditahan. CI hijau saja tidak cukup.
