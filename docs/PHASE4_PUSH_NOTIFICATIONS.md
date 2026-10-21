# Fase 4 — Notifikasi push privat

Status: PR #16 dan hardening opt-out PR #18 sudah merged. CI #152 (source) dan #153 (pasca-merge) lulus. Migration sudah diterapkan pada Supabase project sajlpngmpkizwjbarxlj dan Edge Function send-chat-push ACTIVE dengan verify_jwt=true. Build #153 memastikan Firebase Android config belum tersedia, jadi push sengaja nonaktif; service-account secret server belum dikonfigurasi/terverifikasi. Tidak ada teks chat, ciphertext, nama pengirim, nama file, identitas pasangan, pair ID, atau message ID di payload FCM.

## Desain keamanan

- Hanya APK Android yang dikompilasi dengan Firebase client config dapat mengaktifkan fitur. Build tanpa konfigurasi tetap sukses, kontrol push dinonaktifkan, dan izin Android tidak diminta.
- Pengguna harus masuk dengan akun yang benar, menyelesaikan verifikasi fingerprint pasangan, dan mengaktifkan toggle dengan sengaja. Izin runtime Android hanya diminta setelah tindakan tersebut.
- Tabel device_push_tokens dibatasi RLS agar setiap user hanya dapat membaca, mendaftarkan, memperbarui, dan menghapus token miliknya sendiri. Token pasangan tidak terlihat dari client.
- Tabel push_dispatches adalah ledger internal idempotensi; RLS aktif dan hanya service_role mendapat grant. Tidak ada plaintext atau ciphertext disimpan.
- Fungsi Edge send-chat-push mewajibkan JWT pengguna. Ia memverifikasi message ID berasal dari pengirim login, umur pesan masih baru, anggota pasangan tepat dua orang, dan fingerprint kunci penerima sudah diverifikasi oleh pengirim.
- FCM hanya menerima judul “Our Space”, isi generik “Ada pesan baru menunggu.”, dan data “type=new_message”. Notifikasi disetel visibility PRIVATE dan memakai channel Our Space.
- Ketukan notifikasi hanya mengarahkan ke tab chat. PIN lokal aplikasi tetap wajib; payload tidak memuat message ID sehingga tidak dapat membuka pesan tertentu melewati gerbang PIN.
- Saat keluar akun, token server dicabut sebelum sesi Auth dihapus. Jika pencabutan gagal karena jaringan, proses Keluar dihentikan untuk mencegah akun meninggalkan token push aktif.
- Pengiriman push bersifat best-effort dan tidak boleh menggagalkan pengiriman chat. Pesan asli tetap terenkripsi end-to-end dan disimpan melalui alur Fase 2/3.

## Pengaturan Firebase client (gratis)

1. Buat atau gunakan project Firebase pada Spark/no-cost plan. Firebase Cloud Messaging tercantum sebagai produk no-cost pada [halaman pricing Firebase](https://firebase.google.com/pricing?hl=id), dan penggunaan produk gratis di Spark tidak memerlukan payment information menurut [dokumentasi pricing plan](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans). Daftarkan Android app dengan package name persis com.ourspace.app.
2. Aktifkan Firebase Cloud Messaging dan unduh google-services.json untuk aplikasi Android tersebut.
3. Jangan commit file ini ke repository. Encode file lokal menggunakan base64 -w0 google-services.json (pada shell yang mendukung -w0) lalu simpan hasilnya ke GitHub Actions Secret bernama FIREBASE_ANDROID_CONFIG_BASE64.
4. Setelah secret tersimpan, workflow akan memvalidasi project ID dan package name, menambahkan file ke direktori build Android saja, lalu menghasilkan APK baru. Jika secret kosong, build sengaja tetap menonaktifkan push.

## Pengaturan kredensial server

Ikuti [docs/FCM-WORKLOAD-IDENTITY.md](FCM-WORKLOAD-IDENTITY.md) untuk membuat service account FCM tanpa kunci JSON, menyiapkan OIDC Workload Identity Provider dengan condition khusus dua akun, dan memberikan binding Workload Identity User per subject.
2. Di Supabase Edge Function Secrets, set `GOOGLE_WIF_AUDIENCE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, dan `FCM_PROJECT_ID` sesuai panduan. Private key JSON tidak dipakai.
3. Status fungsi melakukan pertukaran STS dan impersonasi access token 10 menit. Toggle hanya aktif jika konfigurasi cocok dan Google menerima pertukaran itu.
4. Jika kredensial/konfigurasi belum tersedia atau salah, aplikasi tetap nonaktif dan tidak meminta izin Android. Ini disengaja fail-closed.

## Uji penerimaan

- CI: dependency audit, tes kontrak keamanan, build web, Capacitor sync, dan APK build harus lulus.
- Dengan secret belum diisi, verifikasi toggle nonaktif dan tidak ada dialog izin.
- Setelah dua konfigurasi valid, install APK bertanda tangan stabil sebagai update di kedua HP. Aktifkan toggle secara terpisah di setiap HP.
- Kirim teks, lalu media, dari satu HP ke HP lain ketika penerima berada di background/layar terkunci. Sistem hanya boleh menampilkan kalimat generik.
- Ketuk notifikasi saat aplikasi terkunci: layar PIN muncul dahulu; setelah PIN benar, tab chat dibuka. Tidak ada pesan tertentu yang dibuka otomatis.
- Matikan toggle atau keluar akun lalu pastikan server token milik perangkat tersebut terhapus. Uji receiver tanpa token harus menghasilkan no-op, bukan error pada chat.
- Uji izin ditolak, token expired, salah project ID, fungsi tidak tersedia, jaringan gagal, notifikasi ganda, dan ketukan notifikasi saat proses aplikasi dimulai ulang.

## Batasan

Firebase client config dan konfigurasi Google Cloud WIF masih merupakan blocker eksternal. Edge Function v2 sudah dideploy namun push tetap fail-closed. Implementasi belum dinyatakan aktif sampai status probe Google berhasil, build baru menggunakan Firebase config, dan uji dua arah di kedua HP lulus.

## Pembaruan keyless

Implementasi WIF pada PR #22 telah digabung ke `phase-2/e2ee-text-chat` dan Edge Function v2 sudah ACTIVE. Jalur JSON-key lama dihapus. Konfigurasi Google serta pengiriman dua perangkat belum teruji; ikuti `docs/FCM-WORKLOAD-IDENTITY.md` untuk pool/provider, subject restrictions, secrets, dan pengujian.
