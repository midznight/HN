# Decisions — Our Space

Catatan keputusan diperbarui 21 Oktober 2026 — Fase 4 opt-out hardening.

1. **Pertahankan chat teks yang sudah berjalan.** Tidak mereset pair, fingerprint, private key, pesan atau membership untuk mengaktifkan media. Migration Fase 3 hanya memperluas constraint tipe pesan dan menambah private Storage/policies.
2. **Tidak membuat bucket public.** Media asli dienkripsi di perangkat; Storage hanya berisi ciphertext dengan content type generik.
3. **Pemisahan kriptografi per tipe konten.** Chat teks menggunakan konteks derivasi `text`, metadata lampiran menggunakan `media`, dan file media memakai `media/blob`; AAD juga mengikat konteks tersebut.
4. **Batas file awal 3 MiB.** Mencegah penggunaan memori tinggi di WebView/native dan tetap di bawah bucket limit 4 MiB setelah header/tag. Peningkatan limit memerlukan desain streaming/chunking, bukan sekadar menaikkan angka.
5. **Tidak menjanjikan zeroization heap JavaScript.** Buffer byte yang dikelola aplikasi dibersihkan setelah digunakan, tetapi string Base64/immutable copies bisa tetap hadir sementara di heap.
6. **API 23–30 fallback jujur soal batas keamanan.** Key privat software dibungkus AES-GCM oleh AES key Android Keystore; ia tetap lebih rentan terhadap kompromi proses daripada private key non-exportable API 31+.
7. **Tanda tangan APK stabil.** Rilis tetap menggunakan keystore signing di GitHub Actions Secrets; keystore tidak boleh masuk repo dan update rutin tidak memerlukan uninstall.
8. **Budget Rp0.** Gunakan project/tier gratis yang sudah ada; jangan provisioning layanan paid atau meminta payment method sebagai langkah tersembunyi.
9. **Periksa state setelah operasi asinkron.** Load/decrypt pesan harus memeriksa kembali status lock dan verifikasi pasangan setelah network/native await. Jika aplikasi terkunci di tengah operasi, jangan merender plaintext atau placeholder error lama; regression test berada di PR #8.
10. **Gate media berdasarkan bukti perangkat.** CI hijau dan migration benar tidak cukup untuk menyatakan Fase 3 selesai. Pengiriman, penerimaan, preview dan save harus diuji di kedua HP, termasuk API 30.
11. **Privasi selama system picker.** Saat picker lampiran terbuka, WebView tetap hidup untuk mempertahankan objek File, tetapi konten `app-layout` disembunyikan. Saat selection selesai, tampilan dipulihkan; saat picker dibatalkan setelah app backgrounded atau timeout, state direset dan aplikasi kembali ke lock gate.
12. **Guard setiap batas await dalam receive media.** Setelah dekripsi metadata, Storage download dan `Blob.arrayBuffer()`, periksa kembali status lock/verifikasi sebelum memulai tahap berikutnya. Buffer ciphertext yang ditinggalkan saat lock dibersihkan best-effort; ini bukan jaminan secure deletion atas heap JavaScript.
13. **Guard sebelum enkripsi media pengirim.** Setelah `File.arrayBuffer()` selesai, periksa status lock/verifikasi sebelum membuat Base64 atau memanggil native crypto. Lepas referensi string Base64 setelah native selesai dan pada `finally`; ini mengurangi umur referensi, bukan jaminan secure deletion.

14. **Push selalu generik.** FCM tidak menerima plaintext, ciphertext, pengirim, pair ID, message ID, nama file, atau media metadata. Payload hanya berisi judul aplikasi, kalimat ada pesan baru, dan type=new_message.
15. **Push opt-in dan fail-closed.** Izin OS tidak diminta saat startup. Client harus dibangun dengan Google Services config dan Edge Function harus berhasil menguji Workload Identity Federation, impersonasi access token FCM sementara, dan project ID sebelum toggle aktif.
16. **Token hanya milik pemilik.** RLS membatasi CRUD device_push_tokens untuk auth.uid() sendiri; push_dispatches tidak punya grant user dan hanya service_role boleh mengaksesnya.
17. **Logout mencabut token dahulu.** Jika token belum berhasil dicabut karena network error, tahan proses logout agar perangkat tidak terus menerima notifikasi akun yang ditinggalkan tanpa konfirmasi.

18. **Opt-out harus konsisten secara durabel.** Simpan preferensi lokal nonaktif sebelum menghapus token server; jika penghapusan gagal, kembalikan preferensi aktif bila memungkinkan. Saat login terverifikasi berikutnya, jika preferensi lokal nonaktif tetapi token server masih ada, coba hapus token sisa. Jangan meneruskan logout bila preferensi opt-out tidak dapat dipersistenkan.

19. **Jangan simpan kunci service account FCM permanen.** Karena pembuatan key JSON diblokir kebijakan organisasi dan kunci berumur panjang berisiko tinggi, PR #22 memilih Google Workload Identity Federation dengan token FCM berumur 10 menit. Provider hanya boleh mengizinkan UUID dua anggota; dokumentasi mencatat bahwa sesi dua akun tepercaya secara teknis bisa melakukan pertukaran langsung di luar fungsi. Jika isolasi server-only diperlukan, evaluasi runtime dengan identitas terkelola dan periksa biaya sebelum provisioning.

20. **Deploy tanpa mengaktifkan fitur.** Setelah CI #171 lulus, fungsi WIF v2 dapat dideploy lebih awal karena tetap fail-closed saat secret/provider belum tersedia. Menjaga `verify_jwt=true`; deployment bukan klaim bahwa Google auth atau delivery sudah teruji.

## Keputusan implementasi Fase 0.5 dan akhir fase — 21 Oktober 2026

14. **Tanggal jadian belum ditetapkan.** UI tidak menampilkan hitung hari, countdown, atau cerita/kenangan yang bergantung pada tanggal palsu. Kartu diganti menjadi “Ruang Kita”.
15. **Tiga tab utama:** Obrolan, Kita, Brankas. Setelah PIN, Obrolan dibuka secara default; settings dicapai dari Kita; panggilan tidak menambah tab terpisah.
16. **Media perlu persetujuan kontekstual:** pilih file → pratinjau → Kirim atau Batal. Ini disengaja untuk mencegah salah-kirim. Upload tidak boleh dimulai hanya karena file dipilih.
17. **Brankas memakai E2EE yang sudah ada.** Tidak membuat algoritma baru: objek menggunakan enkripsi native media existing; metadata menggunakan envelope pesan E2EE existing. Bucket tetap privat, tidak mempublikasikan signed URL, dan plaintext metadata tidak ditambahkan sebagai kolom.
18. **Panggilan harus fail-closed.** SDP/riwayat ditulis sebagai ciphertext; aplikasi perlu sesi pair dan fingerprint valid. Jika signaling/permission gagal, tidak berpura-pura panggilan tersambung. Sesi berhenti saat lock; incoming call pada app tertutup belum didukung.
19. **Anggaran Rp0 tetap berlaku.** Implementasi call tidak menambahkan TURN berbayar. STUN-only tidak menjamin koneksi di semua jaringan; jangan menyamarkan batas teknis itu.
20. **Status “siap rilis” berdasar bukti.** CI hijau tidak menggantikan uji dua HP, stable-signature APK update, konfigurasi WIF untuk FCM, atau audit release security.

21. **Mandat otonom (21 Oktober 2026).** Pengguna meminta semua fase diteruskan tanpa persetujuan bertahap. Keputusan ini mengizinkan tindakan engineering yang aman, tetapi tidak menghalalkan bypass CI, reset kunci atau klaim rilis tanpa bukti.
22. **Voice note** direkam lokal di WebView, durasi maksimal 90 detik, ukuran dibatasi di bawah 3 MiB; rekaman hanya masuk ke pratinjau. Batal tidak mengirim.
23. **Balasan dan reaksi emoji** dipisahkan dari payload pesan teks lama untuk kompatibilitas. Target, emoji, reply linkage, dan active state disimpan dalam envelope ciphertext; server tidak mendapat kolom plaintext.
24. **Tidak ada service relay berbayar** untuk WebRTC. Pengalaman call tetap ditandai sebagai keterbatasan dan tidak diklaim bekerja di semua NAT/firewall.

