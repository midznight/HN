# Our Space — Setup dan Prosedur Operasional

**Status:** panduan awal Fase 0. Tidak ada layanan, akun atau secret yang dibuat/diubah saat dokumen ini ditulis.  
**Verifikasi dokumen/harga:** 20 Oktober 2026.  
**Repositori:** [midznight/HN](https://github.com/midznight/HN) saat ini **public**. Source dan dokumentasi dapat dibaca siapa pun. Jangan commit password, service account, Supabase service-role key, token, keystore, atau data pribadi.

## 1. Hal yang dipastikan sebelum build

1. PIN prototipe `1208` harus dihapus dari kode dan placeholder. Jangan gunakan `1208` karena sama dengan tanggal jadian 12 Agustus dalam format DDMM. Buat PIN baru saat onboarding; rekomendasi minimal 6 digit.
2. Prototipe menyebut tanggal 12 Agustus 2021. Spesifikasi menggunakan `[TANGGAL_JADIAN]`, jadi konfirmasikan tanggal itu sebelum anniversary/counter diaktifkan.
3. Keputusan kunci E2EE perlu persetujuan: rekomendasi saya adalah membuat/menggunakan private key ECDH P-256 langsung di Android Keystore lewat plugin Capacitor native kecil, sedangkan HKDF/AES-GCM memakai Web Crypto. Ini berbeda dari ECDH sepenuhnya lewat Web Crypto, tetapi konsisten dengan syarat private key berada di Keystore. Jangan mengunci implementasi tanpa persetujuan.
4. Password dua akun Supabase tidak boleh ditanam di APK. Onboarding harus mengaitkan identitas dengan kredensial satu kali lalu menyimpan sesi di penyimpanan native; pemilihan nama saja tidak boleh membuka akun server.

## 2. Supabase Free — tindakan manual di dashboard

Belum dilakukan oleh Fase 0. Saat provisioning:

1. Buka [Supabase Dashboard](https://supabase.com/dashboard), buat organisasi/project pada paket **Free**, jangan mengaktifkan upgrade/add-on berbayar.
2. Simpan Project URL, project reference ID, dan database password di password manager pribadi. Jangan masukkan password DB ke APK atau repo.
3. Buat dua user permanen melalui **Authentication → Users → Add user**: satu untuk Hamid, satu untuk Nur. Gunakan email yang dikuasai masing-masing dan password acak panjang yang berbeda. Simpan kredensial privat untuk onboarding awal; jangan tulis di issue/PR atau file repo public.
4. Setelah kedua akun ada, matikan pendaftaran publik di **Authentication → Settings**; cari opsi *Allow new users to sign up* (label bisa berubah). Jangan hapus kedua akun.
5. Catat UUID kedua user dari halaman Users untuk seed/migration Fase 2.
6. Jangan buat bucket public. Fase implementasi akan membuat bucket privat, RLS dan metadata ciphertext.
7. Jangan menguji dengan pesan/foto pribadi atau menempelkan private key ke SQL Editor, log atau issue.

### Batas free tier

Saat dicek 20 Oktober 2026, halaman resmi Supabase menyebut **500 MB database/project, 1 GB Storage, 5 GB egress uncached + 5 GB cached, dan upload global Free sampai 50 MB per file**. Project Free dapat dipause setelah aktivitas rendah sekitar 7 hari. UI harus membaca kuota aktual, menangani upload di atas limit, dan tidak menampilkan kapasitas contoh 50 GB.

Referensi: [billing/quota](https://supabase.com/docs/guides/platform/billing-on-supabase), [Storage pricing](https://supabase.com/docs/guides/storage/pricing), [upload limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## 3. Firebase Cloud Messaging — Fase 4

Belum diperlukan/dibuat pada Fase 0. Saat Fase 4:

1. Buka [Firebase Console](https://console.firebase.google.com/) dan buat project dengan plan **Spark**. Firebase mencantumkan Cloud Messaging sebagai produk gratis dan Spark tidak meminta info pembayaran untuk produk gratis: [Firebase pricing](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).
2. Daftarkan aplikasi Android memakai application ID yang sudah dipatok pada Fase 1.
3. Unduh `google-services.json`. Jangan commit file; simpan sebagai GitHub Actions Secret dan buat file saat workflow build berjalan.
4. Untuk push dari server, buat service account dengan izin FCM minimum. Simpan JSON sebagai secret environment Supabase Edge Function/server saja—bukan di JS, asset Android atau repo.
5. Minta izin notifikasi Android 13+ dan tangani penolakan. Tes foreground, background, app tertutup normal, layar terkunci dan reboot.
6. Payload push generik: tanpa isi pesan, caption, nama file, preview, private key atau media.

FCM gratis bukan jaminan delivery mutlak. Google Play Services, jaringan, izin, optimasi baterai OEM, Android full-screen intent dan status force-stop berpengaruh.

## 4. GitHub Actions Secrets — isi sesuai fase

Buka repo `midznight/HN` → **Settings → Secrets and variables → Actions**. Nama berikut hanya rencana; secret belum dibuat. Tambahkan saat workflow yang sesuai sudah ada.

| Nama | Kegunaan | Catatan |
|---|---|---|
| `SUPABASE_URL` | URL project untuk build/deploy | Bukan rahasia; bisa menjadi Actions variable. |
| `SUPABASE_ANON_KEY` | Kunci publik Supabase client | Bukan rahasia; RLS tetap pembatas akses sesungguhnya. |
| `SUPABASE_PROJECT_REF` | Target project migrations/functions | Gunakan nilai aktual. |
| `SUPABASE_ACCESS_TOKEN` | Deploy migration/function dari CI bila dipakai | Token berkuasa tinggi; batasi akses dan rotasi bila bocor. |
| `SUPABASE_DB_PASSWORD` | Migrasi schema via pipeline jika diperlukan | Secret; jangan echo ke log. |
| `GOOGLE_SERVICES_JSON_BASE64` | Membentuk Firebase config saat build | Baru dibutuhkan Fase 4; jangan cetak secret/file ke log/artifact. |
| `ANDROID_KEYSTORE_BASE64` | Keystore signing APK release | Belum diperlukan APK debug. Backup offline aman; kehilangan key mencegah update dengan identitas signature yang sama. |
| `ANDROID_KEYSTORE_PASSWORD` | Password keystore release | Secret. |
| `ANDROID_KEY_ALIAS` | Alias kunci release | Konfigurasi CI sesuai workflow. |
| `ANDROID_KEY_PASSWORD` | Password private key release | Secret. |

Jangan masukkan `SUPABASE_SERVICE_ROLE_KEY` ke kode client/build. Service-role key hanya untuk server bila diperlukan dan disimpan di environment server yang dibatasi. Jangan jalankan workflow dari pull request fork dengan akses secret dan jangan cetak secret dalam output.

`google-services.json` dan signing keystore baru diperlukan saat fase masing-masing. APK debug Fase 1 semestinya tidak membutuhkan secret signing release. APK release bertanda tangan yang dapat di-update memerlukan keystore konsisten yang sama di setiap build release.

## 5. Metered Open Relay TURN — Fase 5

Halaman resmi Metered saat dicek menyebut **20 GB TURN relay gratis/bulan**, dan Metered Realtime mengiklankan tier gratis tanpa kartu dengan 100 koneksi serentak dan 100.000 pesan/bulan. Referensi: [Open Relay](https://www.metered.ca/tools/openrelay/) dan [Realtime free tier](https://www.metered.ca/tools/openrelay/webrtc-signaling-server/).

- Belum ada akun/API key yang dibuat.
- Jika dipakai, API key disimpan sebagai secret fungsi server, bukan JS/APK/repo. Fungsi server mengembalikan kredensial TURN berumur terbatas setelah memverifikasi sesi.
- Supabase Realtime tetap menjadi signaling; TURN hanya relay media bila koneksi langsung gagal.
- Kuota 20 GB terbatas dan bisa habis. UI harus menampilkan error/coba ulang atau audio-only, bukan menjanjikan panggilan selalu tersedia.
- Verifikasi harga, batas, credential dan syarat tanpa kartu lagi pada Fase 5.

## 6. Build APK tanpa Android Studio

Pada Fase 1, GitHub Actions akan meng-install dependency dari lockfile, build UI lokal, menjalankan pemeriksaan yang tersedia, dan mengunggah APK debug sebagai artifact. Setelah workflow selesai:

1. Buka repo → **Actions** → workflow build terbaru yang sukses.
2. Di bagian **Artifacts**, unduh APK debug ke Android.
3. Izinkan instalasi dari sumber yang digunakan untuk membuka APK, instal, lalu nonaktifkan lagi izin sumber tidak dikenal jika tak dibutuhkan.
4. Tes PIN salah/benar, mode pesawat, buka ulang app, tombol Back, keyboard pada chat, safe area status/nav bar dan rotasi layar.

Build release dengan signature stabil dibuat setelah release keystore aman tersedia. APK debug bukan paket Play Store. GitHub Actions artifact dan sideload tidak membutuhkan Android Studio.

## 7. Checklist pengujian manual per fitur

Belum ada fitur yang dinyatakan lulus pada Fase 0. Checklist harus dilaporkan setelah implementasi tiap fase.

| Fitur | Tes manual |
|---|---|
| 1. PIN | Instalasi baru meminta PIN; `1208` tidak ada di source/APK; PIN salah ditolak dan jeda naik; background mengunci; PIN tetap bekerja offline. |
| 2. Chat E2EE | Hamid ↔ Nur; database/API hanya ciphertext; fingerprint cocok diverifikasi dua pihak; perubahan key menampilkan peringatan. |
| 3. Media | Image/video/voice note/video note; izin dibatalkan, jaringan putus saat upload, kuota habis, progress/retry, dekripsi penerima, simpan galeri. |
| 4. Notifikasi | Izin Android 13+, foreground/background/app tertutup normal/layar terkunci/reboot; tidak ada plaintext di push. |
| 5. Panggilan | Audio/video, Wi-Fi/data, izin mic/kamera ditolak, reject/end, direct connection dan TURN; catat batas OS/quota. |
| 6. Brankas/log | Upload/unduh/hapus ciphertext, kapasitas dan sisa kuota nyata, hanya panggilan aktual masuk ke log dan durasi dari timestamp. |
| 7. Audit | Akun ketiga ditolak di DB, Realtime dan bucket; tidak ada plaintext/private key di server/log/push; simpan hasil tes nyata. |
| 8. Widget | Nonaktif dan berlabel sampai diminta; tidak termasuk Fase 0–7. |

## 8. Aksi dashboard yang belum dilakukan

Fase 0 hanya membaca repo dan menulis dokumentasi. Belum ada Firebase project, Supabase project/user/bucket/table, GitHub Secret, package Android, APK atau migration yang dibuat/diubah oleh pekerjaan ini.


## 9. Fase 1 — kerangka Android dan uji PIN lokal

Branch implementasi: `phase-1/capacitor-offline-shell`. Perubahan fase ini mempertahankan markup utama prototipe, mengganti font/ikon/build CDN dengan paket yang dibundel saat build, mengganti gambar Unsplash dengan SVG lokal, serta menambahkan gate PIN dan pemilihan identitas lokal.

### Build otomatis

1. Buka **Actions → Build Our Space Android Debug APK** pada repositori dan pilih run dari branch `phase-1/capacitor-offline-shell` bila workflow belum berjalan otomatis.
2. Tunggu semua langkah hijau. Jika gagal, buka log job dan catat langkah error; jangan menganggap APK tersedia bila job gagal.
3. Unduh artifact `our-space-debug-apk`, pindahkan APK ke Android, lalu instal. APK debug belum ditandatangani untuk distribusi Play Store.
4. Pastikan perangkat memiliki Android WebView/Chrome yang diperbarui. Aset tampilan dibundel dalam APK; PIN gate dirancang tetap bisa dibuka dalam mode pesawat.

### Tes penerimaan Fase 1

- Pada instalasi pertama, pilih tepat satu identitas (**Aku Hamid** atau **Aku Nur**), buat PIN 6–12 digit, lalu konfirmasi PIN. Jangan gunakan `1208` atau tanggal jadian sebagai PIN.
- Tutup dan buka kembali aplikasi: identitas tetap dipilih, layar terkunci meminta PIN. PIN salah harus ditolak; setelah tiga kegagalan, jeda percobaan meningkat. PIN benar membuka UI.
- Aktifkan mode pesawat lalu buka aplikasi dan navigasikan Dashboard, Messages, FaceTime, Drive, Settings. Tidak boleh ada permintaan aset ke domain pihak ketiga.
- Pada Android, pindah ke aplikasi lain lalu kembali: aplikasi meminta PIN lagi. Tekan Back pada tampilan selain Dashboard: kembali ke Dashboard; Back di Dashboard mengunci aplikasi.
- Uji keyboard, safe area, dan scroll pada layar kecil. Jika animasi lambat, blur harus beralih ke fallback tanpa blur.
- Dashboard opsional ditandai **Belum aktif**. Chat, log panggilan, dan Brankas menampilkan keadaan kosong, bukan pesan/log/kuota contoh. Chat sengaja dinonaktifkan sampai Fase 2.

### Batas yang diketahui

- PIN hash + salt disimpan menggunakan Capacitor Preferences dan diverifikasi dengan PBKDF2-HMAC-SHA-256. Ini adalah pengunci lokal, bukan kunci E2EE atau autentikasi server. Fase 1 belum membuat akun Supabase atau kunci ECDH.
- Paket langsung di `package.json` memakai versi eksplisit. Workflow menggunakan `npm install` karena lockfile belum dikomit; setelah build pertama sukses, lockfile hasil resolusi perlu ditinjau dan dikomit sebelum menyebut dependency tree sepenuhnya reproducible.
- Fase 1 belum dianggap lulus sebelum workflow menghasilkan APK dan tes instalasi nyata di HP berhasil. Build CI tidak menggantikan uji perangkat.
