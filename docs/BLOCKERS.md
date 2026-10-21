# Blockers — Our Space

Pembaruan: 21 Oktober 2026. Jangan menyamakan kode yang sudah ada dengan fitur yang sudah diuji dan siap rilis.

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
- Pembersihan object ciphertext yang gagal dapat meninggalkan orphan; status UI menyatakan keterbatasan itu. Jangan mengklaim penghapusan fisik pasti jika Storage gagal.

## Konfigurasi keamanan/Auth

- Supabase Security Advisor melaporkan proteksi password bocor dinonaktifkan. Aktifkan/verifikasi dari Auth settings dashboard sebelum rilis publik. Tool yang tersedia di sesi ini tidak menyediakan kontrol untuk mengubah opsi dashboard tersebut.
- Advisor info tentang public.push_dispatches RLS tanpa policy sengaja dipertahankan: tabel hanya untuk service role. Jangan menambah policy client untuk menghilangkan peringatan.
- Tinjau semua migrasi aditif, hasil RLS negative tests, serta secret hygiene sebelum rilis.

## Gerbang APK/rilis

- Keystore signing stabil harus tersedia di GitHub Actions Secrets. Jangan membuat signature sementara untuk update kepada dua HP yang sudah menyimpan key/pesan.
- Build APK terbaru dan pemasangan update tanpa uninstall belum diverifikasi pada perangkat.
- Tidak ada uji OEM/Android aktual yang bisa dilakukan dari CI; artifact harus dipasang dan diuji sebelum rilis final.
- Jangan reset pair, device_keys, key_verifications, private key atau pesan untuk mengatasi error.

## Batas biaya

Gunakan free tier yang sudah aktif; jangan provision layanan berbayar, membeli credit atau meminta kartu kredit. TURN relay dengan charge per GB tidak diaktifkan karena batas anggaran Rp0.
