# Our Space — Daftar Fitur

Pembaruan: 22 Oktober 2026. “Teruji pengguna” berarti pengguna mengonfirmasi alur itu berhasil; bukan audit keamanan independen.

| Fitur | Status | Catatan |
|---|---|---|
| PIN lokal dan penguncian | Baseline tersedia | PIN lokal bukan kredensial Supabase atau kunci E2EE. |
| Dua identitas privat Hamid/Nur | Baseline tersedia | Membership diverifikasi server; pilihan nama lokal tidak memberi akses. |
| Chat teks E2EE | Teruji pengguna | Chat dua arah dan reopen pernah berhasil pada dua HP; Android 11/API 30 ikut diuji untuk chat teks. |
| Fingerprint perangkat | Tersedia pada baseline | Jangan mengatur ulang key binding untuk update. |
| Lampiran gambar/video/audio E2EE | Diterima pengguna | Maksimal 3 MiB; file dienkripsi di perangkat, bucket privat menyimpan ciphertext. |
| Pratinjau sebelum kirim | Diterapkan | Upload chat hanya berjalan setelah tombol konfirmasi; Batal tidak mengirim. CI harus tetap lulus pada commit terbaru. |
| UI rose-coral, navigasi Obrolan/Kita/Brankas | Terintegrasi di branch produk via PR #25 | Obrolan dibuka sesudah PIN; settings dari Kita. CI dan build APK pada merge commit sukses; QA dua HP masih terbuka. |
| Brankas terenkripsi | Implementasi awal di branch produk | Modul klien memakai E2EE dan bucket privat; metadata filename/MIME/size/path ada dalam envelope terenkripsi. Tabel vault_items ber-RLS. Uji dua HP belum dilakukan. |
| Panggilan suara/video WebRTC | Implementasi awal terintegrasi, belum terverifikasi di perangkat | Sinyal SDP dan riwayat disimpan sebagai ciphertext. Hanya mendukung sesi foreground Android dengan permission; tidak ada panggilan masuk ketika aplikasi tertutup. STUN-only bisa gagal pada NAT/firewall tertentu; TURN belum dikonfigurasi. |
| Riwayat panggilan | Implementasi awal | Metadata mode/outcome/durasi disimpan terenkripsi dan ditampilkan sebagai kartu di timeline chat. Belum diuji dua HP. |
| Notifikasi push FCM | Ter-deploy tetapi fail-closed | Aktivasi menunggu Google Workload Identity Federation, secrets server dan uji push dua HP. Payload dirancang generik. |
| Rekam voice note dari aplikasi | Implementasi awal terintegrasi | MediaRecorder lokal maksimal 90 detik dan di-batasi sebelum 3 MiB; rekaman hanya masuk ke pratinjau, tidak auto-send. Izin mic dan uji perangkat belum lulus. |
| Balasan pesan dan reaksi emoji tersinkron | Implementasi awal terintegrasi | Pakai tabel message_annotations ciphertext-only; target ID, emoji dan state ada dalam envelope E2EE. CI ada; uji sinkronisasi dua HP dan compatibility belum selesai. |
| Audit keamanan independen | Belum | Tes kontrak bukan pengganti audit eksternal. |

## Batas keamanan dan operasional

- Belum ada Double Ratchet/forward secrecy maupun multi-device; hilangnya private key dapat membuat pesan lama tidak bisa didekripsi.
- Jangan menyimpan plaintext, metadata file privat, atau materi kunci ke database/log/analytics.
- Buffer JavaScript tidak dapat dijanjikan terhapus aman dari heap; pengosongan Uint8Array hanya best-effort.
- Riwayat signaling dan tabel panggilan masih bisa mengungkap metadata routing (pair, peserta, waktu, ukuran envelope), meski SDP/ICE/konten panggilan dienkripsi.
- Konektivitas WebRTC universal belum dijamin tanpa relay TURN dan uji lintas jaringan.
