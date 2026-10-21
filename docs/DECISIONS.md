# Decisions — Our Space

Catatan keputusan diperbarui 21 Oktober 2026.

1. **Pertahankan chat teks yang sudah berjalan.** Tidak mereset pair, fingerprint, private key, pesan atau membership untuk mengaktifkan media. Migrasi Fase 3 hanya mengubah constraint message_type dan menambah private Storage/policies.
2. **Tidak membuat bucket public.** Media asli dienkripsi di perangkat; Storage hanya berisi ciphertext dengan content type generik.
3. **Pemisahan kriptografi per tipe konten.** Chat teks menggunakan konteks derivasi `text`, metadata lampiran menggunakan `media`, dan file media memakai `media/blob`; AAD juga mengikat konteks tersebut.
4. **Batas file awal 3 MiB.** Mencegah penggunaan memori tinggi di WebView/native dan tetap di bawah bucket limit 4 MiB setelah header/tag. Peningkatan limit memerlukan desain streaming/chunking, bukan sekadar menaikkan angka.
5. **Tidak menjanjikan zeroization heap JavaScript.** Buffer byte yang dikelola aplikasi dibersihkan setelah digunakan, tetapi string Base64/immutable copies bisa tetap hadir sementara di heap.
6. **API 23–30 fallback jujur soal batas keamanan.** Key privat software dibungkus AES-GCM oleh AES key Android Keystore; ia tetap lebih rentan terhadap kompromi proses daripada private key non-exportable API 31+.
7. **Tanda tangan APK stabil.** Rilis tetap menggunakan keystore signing yang sudah disimpan di GitHub Actions Secrets; keystore tidak boleh masuk repo dan update rutin tidak memerlukan uninstall.
8. **Budget Rp0.** Gunakan project/tier gratis yang sudah ada; jangan provisioning layanan paid atau memasukkan payment method sebagai langkah tersembunyi.
