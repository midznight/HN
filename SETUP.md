# Our Space — Setup dan Prosedur Operasional

**Status:** panduan awal Fase 0. Tidak ada layanan, akun atau secret yang dibuat/diubah saat dokumen ini ditulis.  
**Verifikasi dokumen/harga:** 20 Oktober 2026.  
**Repositori:** [midznight/HN](https://github.com/midznight/HN) saat ini **public**. Source dan dokumentasi dapat dibaca siapa pun. Jangan commit password, service account, Supabase service-role key, token, keystore, atau data pribadi.

## 1. Hal yang dipastikan sebelum build

1. PIN prototipe `1208` harus dihapus dari kode dan placeholder. Jangan gunakan `1208` karena sama dengan tanggal jadian 12 Agustus dalam format DDMM. Buat PIN baru saat onboarding; rekomendasi minimal 6 digit.
2. Prototipe menyebut tanggal 12 Agustus 2021. Spesifikasi menggunakan `[TANGGAL_JADIAN]`, jadi konfirmasikan tanggal itu sebelum anniversary/counter diaktifkan.
3. Pemilik menyetujui pada 20 Oktober 2026 penggunaan private key ECDH P-256 yang dibuat dan digunakan langsung di Android Keystore lewat plugin Capacitor native kecil; HKDF/AES-GCM tetap memakai Web Crypto. Implementasinya masuk Fase 2; Fase 1 belum membuat kunci E2EE.
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

Fase 1 menambahkan workflow `.github/workflows/android-debug.yml`. Workflow memasang dependency, menjalankan tes shell dan build aset lokal, membuat proyek Android Capacitor pada runner, lalu membangun APK debug. Android Studio lokal dan signing key release tidak dibutuhkan untuk APK debug.

1. Buka repo → **Actions** → run **Build Android APK (debug)** pada branch `phase-1-capacitor-shell`.
2. Pastikan job sukses dan artifact `our-space-debug-apk` tersedia. Jika gagal, baca step merah—jangan menganggap APK selesai.
3. Unduh artifact, ekstrak jika berbentuk ZIP, lalu instal APK pada HP Android.
4. Pada instalasi baru pilih “Aku Hamid” atau “Aku Nur”, buat PIN 6–8 digit dan konfirmasikan. Tutup/buka ulang app, lalu coba PIN benar/salah.
5. Aktifkan mode pesawat dan uji PIN lagi. Coba tombol Back dari Chat/Panggilan/Brankas, keyboard chat, safe area status/nav bar, lalu pindahkan app ke background dan buka kembali.

APK debug belum setara dengan release APK. Signing release memerlukan keystore aman dan konsisten; jangan commit key atau password ke repo.

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

Fase 0 tidak membuat layanan cloud. Fase 1 menambah kerangka Capacitor dan workflow APK, tetapi belum membuat Firebase/Supabase project, user, bucket, migrasi, atau secret cloud.
