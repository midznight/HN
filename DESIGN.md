# Our Space — Desain UI/UX (Fase 0.5)

**Status:** rancangan untuk ditinjau, belum menjadi perubahan UI aplikasi rilis.  
**Posisi fase:** setelah Fase 0, sebelum implementasi Fase 1.  
**Batas:** file HTML di preview-ui adalah pratinjau desain. Tidak terhubung ke Supabase, penyimpanan, notifikasi, enkripsi, atau panggilan nyata.

## Keputusan desain yang telah dikonfirmasi

**Keputusan pemilik — 21 Oktober 2026**
- Tanggal jadian: **belum ditetapkan**. Jangan menampilkan hitung hari, countdown anniversary, atau kenangan yang bergantung pada tanggal sampai pemilik menetapkan tanggal secara eksplisit.
- Pengiriman foto/video: **pratinjau dan konfirmasi sebelum mengirim**. Ini keputusan privasi yang disengaja; pengguna harus dapat memeriksa media yang dipilih lalu memilih Kirim atau Batal.

## 1. Ringkasan pengguna

Our Space dipakai Hamid dan Nur, dua orang yang membuka ruang privat berkali-kali setiap hari dari Android. Momen utama terjadi dalam jeda singkat: membuka chat saat rindu, mengirim foto atau voice note sebelum tidur, dan menjawab panggilan ketika aplikasi berada di latar belakang. Mereka memerlukan status pesan yang jelas, tindakan utama yang mudah dijangkau, serta privasi yang tidak dikorbankan oleh kemudahan.

### Tiga momen terpenting
1. **Membuka ruang saat rindu.** Ikon aplikasi menampilkan layar PIN; setelah PIN benar, tujuan langsung Obrolan, bukan dashboard perantara.
2. **Mengirim sesuatu sebelum tidur.** Kolom tulis selalu terlihat. Mikrofon selalu tersedia dengan kontrol batal/kunci/kirim yang jelas; kegagalan unggah tidak menghilangkan draf.
3. **Menjawab pasangan menelepon.** Panggilan masuk punya tombol Jawab dan Tolak yang besar. Saat aplikasi tertutup, penerimaan panggilan bergantung pada integrasi native, notifikasi, signaling, dan WebRTC; HTML tidak boleh berpura-pura mampu melakukannya.

## 2. Aturan yang dapat diperiksa
- Setelah PIN benar, aplikasi langsung membuka Obrolan.
- Navigasi utama hanya **Obrolan**, **Kita**, **Brankas**. Pengaturan dibuka melalui ikon pada Kita. Riwayat panggilan tampil sebagai kejadian dalam alur chat.
- Semua kontrol utama berukuran minimal 48 × 48 dp; ikon tanpa teks memiliki nama aksesibel.
- Waktu pesan selalu tampak di layar sentuh; informasi penting tidak boleh bergantung pada hover.
- Teks utama minimal 14 px, metadata minimum 12 px, input 16 px.
- Pasangan warna teks/latar token inti memenuhi WCAG AA. Status tidak dibedakan melalui warna saja.
- Tidak ada backdrop-filter pada daftar scroll atau bidang besar. Tidak ada aset, font, ikon, skrip, atau analitik pihak ketiga.
- Layout memakai dynamic viewport, safe area, dan tetap mengizinkan zoom teks.
- Back Android menutup lembar/dialog terlebih dahulu, kembali ke layar sebelumnya berikutnya, dan tidak mengakhiri sesi diam-diam.
- Animasi hanya transform/opacity selama 180 ms, dalam rentang 150–250 ms; hormati pengaturan reduce motion.
- Semua data demo diberi label **CONTOH** dan hanya berada di preview-ui. Nilai demo tidak boleh menjadi state produksi.
- Tanggal jadian belum dikonfirmasi. Hitung hari bersama dan hitung mundur tidak menampilkan angka sebelum tanggal diisi secara sah. Kenangan hari ini hanya dirender bila ada media nyata dengan tanggal kalender sama tahun lalu.
- Tombol yang belum punya backend/native implementation tidak boleh tampak berhasil mengirim data nyata.

## 3. Alur pengalaman

### A. Pertama kali: identitas, PIN, pertukaran kunci
1. Pilih “Aku Hamid” atau “Aku Nur”. Identitas lokal bukan bukti otorisasi server.
2. Buat dan konfirmasi PIN lokal. Jika tidak cocok, tampilkan pesan di dekat input dan jangan lanjut.
3. Autentikasi ke akun yang sesuai melalui alur aman; kredensial tidak ditanam di APK.
4. Perangkat membuat private key. Private key tetap di perangkat/Android Keystore sesuai keputusan implementasi; hanya public key yang dibagikan.
5. Cocokkan fingerprint lewat kanal terpisah. Jika cocok, tandai terverifikasi. Jika berbeda atau berubah, hentikan pengiriman/dekripsi yang memerlukan kepercayaan baru, jelaskan risikonya, dan jangan auto-trust.
6. Sukses membuka Obrolan. Koneksi gagal, token kedaluwarsa, fingerprint belum ada, dan fingerprint berubah mempunyai pemulihan spesifik—bukan spinner tanpa akhir.

### B. Pemakaian harian
- Ikon aplikasi → PIN → Obrolan. Saat terkunci, jangan menampilkan pratinjau pesan.
- Teks: ketik → Kirim. Status menjadi “Mengirim” lalu “Terkirim” setelah konfirmasi server. “Terbaca” hanya ditampilkan jika ada bukti pembacaan.
- Balas melalui geser bubble atau aksi “Balas” dari menu sentuh; kutipan harus membedakan pesan sumber.
- Ketuk dua kali memberi reaksi ❤️. Menu reaksi dibuka melalui tekan lama yang tidak mengganggu scroll.
- Waktu, status kirim, dan status terbaca selalu tampak tanpa hover.
- Offline: teks dapat disiapkan sebagai draf, tetapi harus berlabel “Belum terkirim”.
- Pengiriman gagal mempertahankan draf dan menawarkan Coba lagi atau Buang draf. Retry menggunakan identitas pesan yang sama agar tidak menduplikasi pesan.

### C. Foto/video dan penyimpanan galeri
1. Ikon foto membuka Android Photo Picker. Setelah memilih item, tampilkan pratinjau dengan jenis/ukuran dan tombol Kirim atau Batal.
2. Gambar diputar sesuai orientasi dan dikompresi sebelum enkripsi; video tidak dimuat utuh ke memori. Nama file/metadata pribadi tidak dikirim dalam payload yang tampak oleh server.
3. Tampilkan progres dan tahap (menyiapkan, mengenkripsi, mengunggah) dengan Batalkan. Jika jaringan putus, tawarkan Coba lagi atau Buang draf; jangan menggandakan pesan.
4. Penerima hanya melihat media setelah dekripsi berhasil. Kunci salah/dekripsi gagal menampilkan state netral, tidak pernah byte atau thumbnail mentah.
5. Simpan ke galeri adalah aksi terpisah. Minta izin saat diperlukan. Jika ditolak atau simpan gagal, jelaskan cara pemulihan dan pertahankan penampil.
6. Saat pemilih OS terbuka, samarkan konten dari screenshot. Kembali dari pemilih sementara tidak boleh meminta PIN kedua kali jika sesi native masih sah; jika proses dihentikan, minta PIN dan pulihkan hanya state aman.

**Keputusan privasi:** pratinjau dan konfirmasi kirim tetap ada walau menambah satu tindakan. Ini lebih aman daripada mengirim media otomatis setelah dipilih; pengecualian media dicatat secara eksplisit pada checklist.

### D. Voice note
1. Tekan dan tahan mikrofon untuk merekam; geser ke kiri untuk batal; geser ke atas ke ikon kunci untuk mode bebas tangan.
2. Tampilkan waktu dan gelombang yang berasal dari audio aktual, bukan animasi acak. Setelah selesai, sediakan putar ulang, hapus, dan kirim.
3. Minta izin mikrofon hanya ketika pertama kali benar-benar digunakan. Jika ditolak, tampilkan Buka pengaturan; chat teks tetap berfungsi.
4. Rekaman terputus tidak dikirim. Kompresi dan enkripsi terjadi sebelum unggah; offline/retry mengikuti aturan media.

### E. Panggilan masuk/keluar
- Keluar: ikon audio/video pada header → “Memanggil…” → “Menghubungkan” → “Berlangsung” atau state ditolak/gagal. Jangan merekam panggilan seolah terjadi sebelum signaling mengonfirmasi.
- Masuk: identitas pasangan, jenis panggilan, tombol Jawab/Tolak berukuran besar. Saat background/terkunci, notifikasi dan tindakan jawab memerlukan integrasi native/push/WebRTC.
- Jaringan berubah: tampilkan “Menghubungkan kembali” dan Akhiri. Izin kamera/mikrofon ditolak tidak boleh menghapus chat.
- Riwayat tampil sebagai kartu kejadian dalam obrolan (terlewat, ditolak, selesai dengan durasi terverifikasi); tidak ada tab panggilan.
- Durasi harus berasal dari waktu koneksi aktual, bukan nilai demo.

### F. Kita
- Hitung hari bersama dan hitung mundur hanya jika tanggal jadian telah dikonfirmasi. Kalau belum, tampilkan ajakan mengisi tanggal; jangan mengarang tanggal atau angka.
- Pratinjau pesan terakhir berasal dari pesan lokal terbaru. Semua teks demo ditandai CONTOH.
- “Kenangan hari ini” hanya ditampilkan ketika ada media nyata yang cocok dengan tanggal kalender hari ini tahun lalu; jika tidak ada, komponennya tidak dirender.
- Media terbaru diambil dari Brankas nyata. Tindakan yang tersedia: Obrolan, Brankas, Pengaturan.

### G. Brankas
1. Daftar folder/filter jenis (Semua, Foto, Video, Audio, Dokumen) dan angka kuota berasal dari storage aktual.
2. Item membuka penampil. Keadaan kosong memakai satu kalimat dan satu aksi; produksi tidak memiliki folder/foto demo.
3. Saat kuota belum diketahui, tampilkan “Memeriksa penyimpanan…”. Jika gagal, tampilkan Coba lagi—jangan mengarang kuota.
4. Penghapusan mengonfirmasi apakah hanya menghapus lokal atau objek terenkripsi juga; menghapus file tidak boleh menghapus kunci.

### H. Kegagalan lintas fitur
- Offline: pita “Tidak ada koneksi” tidak menutupi composer.
- Pengiriman gagal: pertahankan teks/media, tawarkan Coba lagi dan Buang draf.
- Kunci tidak cocok: jangan render konten; tawarkan verifikasi ulang tanpa membocorkan isi chat.
- Upload terputus: tampilkan status jeda yang bisa ditindaklanjuti, bukan spinner terus-menerus.
- Izin ditolak: jelaskan dampaknya dan jalur pengaturan Android; fitur yang tidak terkait tetap bekerja.
- Error server/autentikasi: satu pesan singkat dan tindakan yang jelas. Jangan tampilkan detail sensitif di UI.
- State kosong memiliki satu kalimat dan satu aksi; state memuat memakai placeholder stabil; error memiliki pemulihan spesifik.

## 4. Arsitektur informasi
- **Obrolan:** header pasangan, verifikasi, panggilan audio/video; alur teks/balasan/reaksi/foto/video/voice note/kartu panggilan; composer.
- **Kita:** hari bersama/countdown jika tanggal sah, pesan terakhir, kenangan hanya bila ada, media terbaru, ikon Pengaturan.
- **Brankas:** folder, filter jenis, kuota nyata, detail folder, penampil media.
- **Gerbang:** PIN/onboarding hanya ketika terkunci atau pertama kali.
- **Lembar/dialog:** menu lampiran, menu pesan, penampil media, progres unggah, konfirmasi simpan galeri, dialog yang memisahkan logout dan penghapusan kunci.

### Inventaris layar dan state yang wajib ada

| Layar | Tujuan tunggal | Kosong | Memuat | Error/pemulihan |
|---|---|---|---|---|
| PIN | Membuka sesi lokal | Tidak berlaku | Validasi jelas | PIN salah/batas coba |
| Onboarding | Mengikat identitas dan PIN | Belum memilih identitas | Membuat sesi/kunci | PIN tidak cocok/login gagal |
| Fingerprint | Memastikan kunci pasangan | Kunci belum ada | Mengambil public key | Kunci berubah; jangan auto-trust |
| Obrolan | Membaca/mengirim percakapan | Ajak pesan pertama | Skeleton stabil | Offline/kirim gagal + retry |
| Lampiran | Memilih media | Pilihan tak tersedia dijelaskan | Picker OS dibuka | Izin/picker gagal |
| Pratinjau media | Meninjau sebelum kirim | Tidak berlaku | Menyiapkan/progres | Format/ukuran gagal |
| Voice note | Merekam audio | Belum direkam | Durasi/audio live | Izin/rekaman terputus |
| Panggilan masuk | Jawab atau tolak | Tidak berlaku | Menghubungkan | Panggilan tak tersedia |
| Panggilan keluar/aktif | Mengelola panggilan | Tidak berlaku | Memanggil/menghubungkan | Ditolak/terputus/izin |
| Penampil media | Menampilkan media yang didekripsi | Item tak ada tidak dibuka | Dekripsi | Gagal dekripsi, tanpa fallback plaintext |
| Simpan galeri | Menyalin setelah persetujuan | Tidak berlaku | Menyiapkan file | Izin/ruang/penulisan gagal |
| Kita | Melihat konteks hubungan nyata | Tanpa angka/kenangan palsu | Mengambil metadata | Gagal baca/coba lagi |
| Brankas | Menemukan media bersama | Satu kalimat + satu aksi | Folder/kuota stabil | Gagal folder/kuota |
| Detail folder | Menelusuri item | Folder kosong + satu aksi | Memuat item | Akses ditolak/item hilang |
| Pengaturan | Mengelola privasi/preferensi | Nilai opsional dijelaskan | Memuat preferensi | Simpan gagal, jangan pura-pura sukses |
| Toast/dialog | Menjelaskan hasil tindakan | Tidak berlaku | Progres terlihat | Pemulihan konkret |

## 5. Sistem desain

### Token warna

| Token | Terang | Gelap | Penggunaan |
|---|---|---|---|
| bg | #F7F4EE | #151614 | Kanvas |
| surface | #FFFFFF | #20211F | Kartu/bubble |
| surface-raised | #F2EEE6 | #282A27 | Panel/lembar |
| ink | #252522 | #F4F0E8 | Teks utama |
| muted | #59574F | #CCC5B8 | Teks sekunder |
| muted-strong | #6C685F | #B2AA9D | Metadata minimum 12 px |
| accent | #70502F | #E0BB85 | Aksi/status bermakna |
| accent-pressed | #594023 | #F1CC99 | Aksi ditekan |
| accent-soft | #F2E5D0 | #3A3023 | Latar aksen |
| border | #D7D0C4 | #464842 | Pemisah |
| danger | #9D332B | #FFAAA2 | Error/berbahaya |
| success | #1E684F | #8CD6B8 | Berhasil/terverifikasi |
| focus | #70502F | #E0BB85 | Fokus keyboard |

Champagne lama #B28859 tidak dipakai sebagai teks kecil di putih. Muted lama #9CA3AF diganti karena kontras rendah.

### Kontras WCAG token inti

Rasio dihitung dengan rumus kontras relatif WCAG; hasil hanya menjamin pasangan yang diukur.

| Teks | Latar | Rasio | Status |
|---|---|---:|---|
| #252522 | #F7F4EE | 14.00:1 | AA |
| #59574F | #F7F4EE | 6.59:1 | AA |
| #70502F | #F7F4EE | 6.65:1 | AA |
| #FFFFFF | #70502F | 7.30:1 | AA |
| #9D332B | #F7F4EE | 6.50:1 | AA |
| #1E684F | #F7F4EE | 6.08:1 | AA |
| #F4F0E8 | #151614 | 15.97:1 | AA |
| #CCC5B8 | #151614 | 10.59:1 | AA |
| #E0BB85 | #151614 | 10.04:1 | AA |

Audit implementasi tetap harus menguji semua pasangan aktual, termasuk placeholder, tombol, disabled, toast, dan state-error.

### Tipografi, spasi, ukuran
- UI memakai system font: system-ui, -apple-system, Segoe UI, sans-serif; aksen judul boleh Georgia/Times New Roman satu kali. Tidak ada font eksternal.
- Body 16 px / line-height 1.5; judul layar 22–24 px / 1.25; judul kartu 16–18 px; teks bantuan 14 px; metadata minimum 12 px / 1.35.
- Spasi kelipatan 4 px: 4, 8, 12, 16, 20, 24, 32, 40.
- Target sentuh minimal 48 × 48 dp; tombol primer 52–56 dp; jarak antartombol minimal 8 dp.
- Radius: chip 10 px, input/kartu 16 px, panel 22 px, bubble 18 px; bubble punya sudut kecil untuk membedakan arah. Radius hanya membedakan struktur.
- Kartu biasa cukup border; bayangan lembut hanya untuk sheet/dialog. Tidak semua elemen dibuat melayang.

### Komponen dan alasan fungsional
| Komponen | Aturan | Alasan |
|---|---|---|
| Bubble teks masuk/keluar | Maks 82% lebar; waktu/status terlihat | Memindai chat tanpa hover |
| Bubble gambar/video | Rasio terjaga; state dekripsi/unggah | Mengenali media sebelum buka |
| Bubble voice note | Play 48 dp, durasi dan waveform audio asli | Memutar dan memahami panjang rekaman |
| Kartu panggilan | Jenis, hasil, durasi terverifikasi | Riwayat panggilan tetap di chat |
| Composer | Teks, Foto, mikrofon, Kirim selalu jelas | Aksi utama tak tersembunyi |
| Mikrofon | Tahan-rekam, geser-batal, kunci bebas tangan | Mencegah rekaman tak sengaja |
| Menu lampiran | Bottom sheet solid, pilihan jelas | Hindari menu bertingkat |
| Penampil media | Back/tutup, simpan, detail minimum | Tindakan media disengaja |
| Progres unggah | Tahap, progres bila ada, batal | Kendali untuk proses panjang |
| Bottom sheet | Solid; Back/Escape menutup; fokus terjaga | Tindakan kontekstual |
| Toast | Konfirmasi pendek + aksi pulih | Tidak menghentikan alur |
| Dialog | Konsekuensi konkret dan batal | Mencegah kehilangan data/kunci |
| Skeleton | Dimensi stabil, tanpa shimmer wajib | Mengurangi layout shift |
| Banner offline | Satu baris yang tak menutupi composer | Status jaringan jelas |
| Tab bawah | Tiga tab dengan ikon + teks | Navigasi konsisten |

## 6. Gerak dan performa

- Durasi standar 180 ms; rentang 150–250 ms. Easing masuk cubic-bezier(.2,.7,.2,1).
- Hanya transform/opacity. Tidak menganimasikan blur, shadow, height atau layout untuk dekorasi.
- Interaksi sentuh menargetkan umpan balik visual <100 ms; **belum diukur di perangkat**.
- Reduce motion menonaktifkan transisi non-esensial dan gelombang animasi; progres tetap disajikan sebagai teks.
- Daftar pesan produksi perlu virtualisasi jika panjang, dengan anchor scroll yang stabil dan pemisah tanggal.
- Cold start ikon → PIN <2 detik di HP menengah: **belum diukur**; ukur 10 cold start dan laporkan median/p95 menggunakan trace Android.
- Scroll chat 60 fps: **target, belum dibuktikan**; ukur dengan ≥200 pesan sintetis, FrameTimeline/JankStats, p95 frame dan jank.
- CSS, ikon, font dan aset: **HTML pratinjau mandiri**. Pada build produksi, ukur ukuran hasil build; ikon SVG hanya yang digunakan; thumbnail lazy-load; foto dikompresi sebelum enkripsi.
- Panggilan masuk native, zoom teks, izin Android, predictive Back, E2EE, kuota storage aktual, dan save-to-gallery memerlukan pengujian perangkat; tidak dapat dibuktikan melalui HTML statis.

## 7. Fitur ringan di luar cakupan (belum dibangun)

| Nama | Manfaat | Biaya backend | Performa |
|---|---|---|---|
| Pengingat lokal untuk pesan | Membantu ingat mengirim pesan | Tidak ada jika lokal; sinkronisasi butuh backend | Rendah bila bukan proses terus-menerus |
| Tema per obrolan | Personalisasi tanpa mengubah status semantik | Tidak ada; preferensi lokal | Rendah |
| Widget pintasan pasangan | Membuka chat/panggilan cepat | Tidak ada API baru, perlu native Android | Rendah–sedang; default tanpa isi pesan |

## 8. Apa yang diubah dari prototipe

- Lima item navigasi (Dashboard, Messages, FaceTime, Drive, Settings) menjadi tiga tab Indonesia. Panggilan pindah ke header/alur chat.
- Menghapus tiruan jendela macOS, sidebar desktop, dan glass/blur luas; memakai permukaan solid dan batas halus.
- Pratinjau tidak memakai Unsplash, Google Fonts, Tailwind CDN, Lucide CDN, atau permintaan pihak ketiga.
- Menghapus larangan zoom, memakai dynamic viewport dan safe area.
- Waktu pesan selalu terlihat; composer menampilkan kontrol foto, mikrofon dan kirim.
- Token muted/accent diganti agar pasangan inti lulus AA.
- Tidak menetapkan tanggal jadian atau angka hubungan tanpa konfirmasi.
- Memisahkan file pratinjau dari entrypoint aplikasi; tidak mengubah E2EE, database, edge function atau APK.

## 9. Audit mandiri

| Kriteria | Hasil | Bukti / batas |
|---|---|---|
| Aksi utama maksimal dua ketukan | **Lulus dengan pengecualian media yang disengaja** | Kirim teks, voice note, panggilan, dan masuk Brankas; pemilih media mempertahankan konfirmasi privasi |
| Satu tujuan per layar | Lulus pada spesifikasi | Inventaris layar |
| State kosong, memuat, error | Lulus pada spesifikasi/pratinjau | Daftar skenario dan tabel |
| Kontras token inti AA | Lulus pada 9 pasangan | Tabel kontras; pasangan aktual perlu audit ulang |
| Area sentuh ≥48 dp | Lulus aturan CSS, belum diuji fisik | CSS pratinjau |
| Zoom tidak dilarang | Lulus di HTML preview | Tidak ada user-scalable=no |
| Tanpa blur daftar scroll | Lulus di HTML preview | Tidak ada backdrop-filter |
| UI Bahasa Indonesia | Lulus pada label yang dirancang | Nama produk/istilah OS dipertahankan seperlunya |
| Aset pihak ketiga | Lulus untuk HTML pratinjau | Ikon inline; tidak ada URL eksternal |
| Contoh tidak masuk APK | Lulus lewat pemisahan folder | Semua demo di preview-ui; entrypoint produksi tidak disentuh |
| Cold start <2 s, input <100 ms, 60 fps | **Belum diuji** | Butuh HP dan build implementasi |
| Native Back/izin/notifikasi | **Spesifikasi saja** | Tidak dibuktikan HTML statis |
| Backend/E2EE/panggilan/kuota nyata | **Tidak dibangun dalam fase ini** | Preview tidak terhubung layanan |

## 10. Hal yang belum pasti
1. **Tanggal jadian:** pemilik menyatakan belum ditetapkan; hitung hari/countdown/kenangan terkait tetap nonaktif hingga ada keputusan baru.
2. **Panggilan saat aplikasi ditutup:** membutuhkan keputusan dan uji integrasi native, push, signaling, WebRTC, serta perilaku OEM.
3. **Kuota Brankas:** harus berasal dari kuota/storage nyata, bukan angka statis.
4. **Voice note:** rekam dan waveform audio asli belum tersedia pada baseline. HTML hanya memperlihatkan rancangan, bukan kemampuan nyata.
