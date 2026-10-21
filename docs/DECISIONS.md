# Decisions — Our Space

Catatan keputusan diperbarui 21 Oktober 2026 — Fase 4.

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
15. **Push opt-in dan fail-closed.** Izin OS tidak diminta saat startup. Client harus dibangun dengan Google Services config dan Edge Function harus memvalidasi service account serta project ID sebelum toggle aktif.
16. **Token hanya milik pemilik.** RLS membatasi CRUD device_push_tokens untuk auth.uid() sendiri; push_dispatches tidak punya grant user dan hanya service_role boleh mengaksesnya.
17. **Logout mencabut token dahulu.** Jika token belum berhasil dicabut karena network error, tahan proses logout agar perangkat tidak terus menerima notifikasi akun yang ditinggalkan tanpa konfirmasi.
