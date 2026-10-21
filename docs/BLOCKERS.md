# Blockers — Our Space

Pembaruan: 22 Oktober 2026. Jangan menyamakan kode yang sudah ada dengan fitur yang sudah diuji dan siap rilis.

## Blocker Fase 4 — push notification

- Supabase Edge Function send-chat-push aktif dengan verifikasi JWT wajib dan perilaku fail-closed.
- Google Workload Identity Federation belum lengkap: pool/provider OIDC, binding subject untuk dua akun, dan secrets function wajib divalidasi.
- Konfirmasi readiness endpoint dan uji token nyata belum selesai.
- Wajib tes izin Android ditolak, token kedaluwarsa, project ID salah, function/network gagal, duplikasi notifikasi, buka saat PIN gate aktif, dan revoke saat logout.
- Jangan menurunkan syarat subject condition atau membuat service-account JSON private key untuk melewati blocker.

## Blocker Fase 5 — panggilan

- Implementasi WebRTC/signaling E2EE ada di branch implementasi, tetapi CI terbaru dan uji dua perangkat wajib lulus.
- Konfigurasi hanya memakai STUN saat ini; panggilan dapat gagal pada symmetric NAT, firewall, jaringan seluler tertentu, atau kondisi yang memerlukan TURN. Jangan klaim konektivitas universal.
- Panggilan masuk ketika aplikasi tertutup belum didukung; lifecycle mengakhiri sesi saat lock.
- Uji dua HP perlu mencakup izin mic/kamera ditolak, answer/reject/timeout, audio/video, mute, lost connection, lock/background, dan potensi sinyal/riwayat ganda.
- Jika implementasi tidak stabil, nonaktifkan tombol panggilan secara fail-closed tanpa mengganggu chat teks.

## Blocker Fase 6 — Brankas

- Migrasi vault_items dan publikasi Realtime telah diterapkan ke project Supabase sajlpngmpkizwjbarxlj; RLS aktif dan objek tetap berada di bucket privat.
- CI terbaru dan upload → list → open/decrypt → delete harus diuji di kedua HP. Pastikan picker file Android tidak memicu relock yang menghilangkan seleksi.
- Voice note, emoji reaction dan reply link kini memiliki implementasi awal, tetapi perlu tes izin mic, ukuran audio, state reaction, balasan yang targetnya media, sinkronisasi realtime dan mismatch key.
- Pembersihan object ciphertext yang gagal dapat meninggalkan orphan; status UI menyatakan keterbatasan itu. Jangan mengklaim penghapusan fisik pasti jika Storage gagal.

## Konfigurasi keamanan/Auth

- Supabase Security Advisor melaporkan Leaked Password Protection disabled. Dokumen resmi Supabase menyatakan fitur ini tersedia pada Pro dan di atas ([rujukan resmi](https://supabase.com/docs/guides/auth/password-security)). Karena budget Rp0, jangan upgrade. Untuk app privat dua akun, mitigasinya adalah password random dan unik, nonaktifkan sign-up publik, dan jaga kredensial; warning tetap menjadi residual risk dan bukan diklaim selesai. Rilis publik umum tidak didukung pada konfigurasi/budget saat ini.
- Advisor info tentang public.push_dispatches RLS tanpa policy sengaja dipertahankan: tabel hanya untuk service role. Jangan menambah policy client untuk menghilangkan peringatan.
- Tinjau semua migrasi aditif, hasil RLS negative tests, serta secret hygiene sebelum rilis.

## Temuan Auth dan gerbang APK/rilis

- Supabase Security Advisor masih melaporkan **Leaked Password Protection Disabled**. Menurut [dokumentasi resmi](https://supabase.com/docs/guides/auth/password-security), fitur itu Pro+ dan tidak tersedia di Free. Jangan menaikkan paket untuk proyek dengan budget Rp0. Catat sebagai residual risk; sebelum penggunaan privat pastikan password kedua akun adalah random/unik dengan entropi tinggi dan public sign-up off. Warning tetap belum hilang, dan aplikasi tidak dinyatakan siap untuk rilis publik umum.
- Workflow Android kini membuat debug dan release APK dengan keystore Actions yang sama, lalu memverifikasi metadata dan kecocokan digest sertifikat. Hasil Actions final pada HEAD terbaru tetap menjadi sumber kebenaran untuk status artefak.

## Gerbang APK/rilis

- Keystore signing stabil harus tersedia di GitHub Actions Secrets. Jangan membuat signature sementara untuk update kepada dua HP yang sudah menyimpan key/pesan.
- Build kandidat bertanda tangan tidak sama dengan bukti kompatibilitas pemasangan: APK terbaru dan update tanpa uninstall belum diverifikasi pada perangkat. Jangan meminta pengguna uninstall; bandingkan sertifikat instalasi lama jika tersedia.
- Tidak ada uji OEM/Android aktual yang bisa dilakukan dari CI; artifact harus dipasang dan diuji sebelum rilis final.
- Jangan reset pair, device_keys, key_verifications, private key atau pesan untuk mengatasi error.

## Batas biaya

Gunakan free tier yang sudah aktif; jangan provision layanan berbayar, membeli credit atau meminta kartu kredit. TURN relay dengan charge per GB tidak diaktifkan karena batas anggaran Rp0.
