# Fase 4 — Notifikasi push privat

Status: implementasi kode awal sedang disiapkan. Push tetap nonaktif sampai Firebase client config dan service-account server tervalidasi. Tidak ada teks chat, ciphertext, nama pengirim, nama file, identitas pasangan, pair ID, atau message ID di payload FCM.

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

1. Buat atau gunakan project Firebase tanpa mengaktifkan layanan berbayar. Daftarkan Android app dengan package name persis com.ourspace.app.
2. Aktifkan Firebase Cloud Messaging dan unduh google-services.json untuk aplikasi Android tersebut.
3. Jangan commit file ini ke repository. Encode file lokal menggunakan base64 -w0 google-services.json (pada shell yang mendukung -w0) lalu simpan hasilnya ke GitHub Actions Secret bernama FIREBASE_ANDROID_CONFIG_BASE64.
4. Setelah secret tersimpan, workflow akan memvalidasi project ID dan package name, menambahkan file ke direktori build Android saja, lalu menghasilkan APK baru. Jika secret kosong, build sengaja tetap menonaktifkan push.

## Pengaturan kredensial server

1. Dari Firebase Console, buat service-account private key khusus FCM HTTP v1. Perlakukan file JSON ini sebagai rahasia berdaya tinggi; jangan taruh di GitHub repo, issue, log, source code, atau percakapan.
2. Di Supabase Dashboard untuk project yang digunakan aplikasi, buka Edge Functions → Secrets dan tambahkan secret bernama FCM_SERVICE_ACCOUNT_JSON. Isi nilainya dengan seluruh isi service-account JSON. Jangan gunakan key ini pada APK/client.
3. Edge Function membandingkan project ID service-account dengan project ID dari google-services.json. Toggle hanya diaktifkan bila keduanya cocok dan server bisa memakai kredensial service account.
4. Jika kredensial belum tersedia/salah, aplikasi menampilkan status nonaktif dan tidak meminta izin Android. Ini disengaja fail-closed.

## Uji penerimaan

- CI: dependency audit, tes kontrak keamanan, build web, Capacitor sync, dan APK build harus lulus.
- Dengan secret belum diisi, verifikasi toggle nonaktif dan tidak ada dialog izin.
- Setelah dua konfigurasi valid, install APK bertanda tangan stabil sebagai update di kedua HP. Aktifkan toggle secara terpisah di setiap HP.
- Kirim teks, lalu media, dari satu HP ke HP lain ketika penerima berada di background/layar terkunci. Sistem hanya boleh menampilkan kalimat generik.
- Ketuk notifikasi saat aplikasi terkunci: layar PIN muncul dahulu; setelah PIN benar, tab chat dibuka. Tidak ada pesan tertentu yang dibuka otomatis.
- Matikan toggle atau keluar akun lalu pastikan server token milik perangkat tersebut terhapus. Uji receiver tanpa token harus menghasilkan no-op, bukan error pada chat.
- Uji izin ditolak, token expired, salah project ID, fungsi tidak tersedia, jaringan gagal, notifikasi ganda, dan ketukan notifikasi saat proses aplikasi dimulai ulang.

## Batasan

Firebase client config dan service-account key memerlukan tindakan manual di dashboard karena keduanya belum ada di repository/proyek ini. Implementasi belum dinyatakan aktif sampai kedua secret terpasang dan uji di dua HP lulus.
