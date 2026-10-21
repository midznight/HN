# Our Space — Roadmap Operasional

Pembaruan: 22 Oktober 2026. Status membedakan implementasi kode, validasi CI, dan verifikasi nyata di perangkat.

| Fase | Ruang lingkup | Status saat ini |
|---|---|---|
| 0 | Batas keamanan, layanan gratis, arsitektur | Terdokumentasi. |
| 0.5 | UI/UX Android, tiga tab, alur dan desain sistem | Terintegrasi di branch produk melalui PR #25 (merge commit `f2e2ebf`). Palet aplikasi, Tailwind, dan preview diselaraskan Warm Coral/Rose/Blush; zoom dan reduced-motion dipertahankan. |
| 1 | Capacitor shell, PIN lokal, lifecycle Android, APK stabil | CI #117 dan Android build #243 sukses pada merge commit `f2e2ebf`; release APK `0.1.243` diverifikasi metadata, izin, signature, dan digest sertifikat. Instal/update di perangkat tetap belum diverifikasi. |
| 2 | Auth, key binding, fingerprint, chat teks E2EE | Chat dua arah teruji pengguna pada kedua HP; Android 11/API 30 juga pernah diuji untuk chat teks. |
| 3 | Media E2EE, pratinjau, voice note, balasan dan reaksi emoji | Lampiran dasar telah diterima pengguna; recording dan annotations E2EE ada di branch dan diuji lewat kontrak otomatis. Validasi voice note/reply/reaction pada dua HP masih terbuka. |
| 4 | FCM dengan payload generik | Function aktif dan fail-closed; belum siap produksi karena konfigurasi Google WIF/secrets dan uji push dua HP belum tuntas. |
| 5 | WebRTC, signaling E2EE, panggilan suara/video dan riwayat | Implementasi awal sudah masuk branch produk; CI terbaru dan perangkat belum diuji. STUN saja tidak menjamin koneksi pada semua tipe NAT/firewall; belum ada relay TURN yang dikonfigurasi. |
| 6 | Brankas terenkripsi, file privat dan riwayat | Modul klien dan migrasi aditif sudah diterapkan ke Supabase produksi; menunggu CI final serta uji upload/buka/hapus di dua HP. |
| 7 | Audit keamanan, uji negatif, release checklist | Sedang dikerjakan. Belum merupakan audit independen; Leaked Password Protection adalah fitur Pro+ dan dicatat sebagai residual risk pada budget Rp0. |
| 8 | Fitur tambahan | Tidak boleh dinyatakan tersedia sebelum diimplementasi dan diuji secara terpisah. |

## Gerbang rilis

1. CI teranyar lulus: dependency audit, syntax, tes unit/kontrak keamanan, dan build web.
2. Workflow APK menghasilkan build yang ditandatangani keystore stabil; SHA dan metadata APK diperiksa.
3. Semua migrasi aditif tercatat dan RLS/policy diverifikasi terhadap project yang benar.
4. Uji dua arah di kedua HP, termasuk Android 11/API 30 dan versi Android pasangan, mencakup chat, picker, preview media, Brankas, fingerprint, lifecycle dan update APK tanpa uninstall.
5. Untuk panggilan: izin ditolak, tidak dijawab, koneksi hilang, speaker/mute, aplikasi dikunci, serta jaringan yang tidak bisa membangun P2P harus dites; keterbatasan TURN/background dijelaskan.
6. Untuk push: konfigurasi WIF, token auth, izin notifikasi, logout/revoke, notifikasi ganda dan tap ketika terkunci diuji.
7. Tidak ada kebocoran plaintext, nama file, SDP/ICE, atau kunci ke database/log/analytics; uji akun di luar pair ditolak.

## Prinsip rollout

Jangan reset pair, fingerprint, private key atau pesan lama demi membuka fitur baru. Jangan uninstall APK untuk update biasa. Jangan reset identitas atau pesan. Gunakan layanan gratis saja dan jangan menambah service berbayar/kartu kredit. Status saat ini RC `0.1.243`, bukan produksi: WIF/FCM dan uji dua HP masih terbuka; Leaked Password Protection tidak tersedia pada Supabase Free dan dicatat sebagai residual risk; STUN-only membatasi jangkauan panggilan. Jangan sebut “siap rilis” hanya berdasarkan build hijau.
