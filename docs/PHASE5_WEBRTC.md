# Fase 5 — Panggilan WebRTC

Status: implementasi awal dalam branch phase-0.5/app-ui-implementation. Belum diuji di dua HP.

## Arsitektur

- UI panggilan berada dari header Obrolan; tidak ada tab panggilan terpisah.
- WebRTC mengalirkan media peer-to-peer dengan DTLS-SRTP dari browser stack.
- SDP offer/answer dienkripsi memakai native KeyStore E2EE sebelum dimasukkan ke public.call_signals. Candidate addresses berada di SDP terenkripsi; tidak ada kolom plaintext SDP/ICE.
- Riwayat dibuat sebagai envelope ciphertext di public.call_records dan didekripsi di perangkat untuk kartu di timeline chat.
- RLS memerlukan pair membership, sender = auth.uid(), key versi yang didukung, public key P-256 dan verifikasi fingerprint terhadap pasangan.
- Sinyal lama dipangkas oleh trigger ketika sinyal baru masuk. Client mengabaikan sinyal basi/duplikat dan mengakhiri sesi saat app lock.
- Mikrofon/kamera meminta izin Android; UI tidak menunjukkan “tersambung” sebelum state peer connection menunjukkan koneksi.

## Batas yang belum ditutup

- Hanya STUN saat ini. Tidak ada TURN relay yang dikonfigurasi; beberapa jaringan/NAT/firewall tidak akan dapat menyelesaikan peer connection.
- Tidak mendukung incoming-call ketika aplikasi tertutup/background push wake-up. Panggilan diakhiri saat lock.
- Tidak ada pengujian vendor Android/dua perangkat dari CI; butuh tes nyata untuk audio routing, izin, reconnect, background, dan history.
- Database tetap menunjukkan pair ID, sender/recipient, timestamp dan ukuran ciphertext. Isi signaling dan history terenkripsi, tetapi bukan semua metadata.

## Kriteria penerimaan

CI terbaru harus lulus, dua perangkat harus berhasil melakukan panggilan audio/video dan skenario negatif di RELEASE_CHECKLIST.md, tidak ada stream tersisa setelah end/lock, dan limitation jaringan harus dijelaskan. Jika panggilan gagal di jaringan yang memerlukan relay, UI harus jujur dan chat tetap bisa dipakai.
