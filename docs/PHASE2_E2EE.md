# Fase 2 — E2EE teks dan pengikatan akun

**Status:** implementasi sumber berada di branch `phase-2/e2ee-text-chat`; belum dianggap lulus sampai CI, migrasi, dan pengujian dua perangkat nyata berhasil.
**Backend:** project Supabase Free `uhovemhaywtzyfzrmgbh`. Project telah diminta untuk dipulihkan dari status tidak aktif. Tidak ada paket berbayar yang diaktifkan.
**Application ID:** `com.ourspace.app`.

## Perubahan yang tersedia di branch

- Plugin native Capacitor `OurSpaceKeyStore` menggunakan Android Keystore untuk private key ECDH P-256 dan kunci pembungkus sesi AES-256-GCM.
- ECDH shared secret tidak dikembalikan ke JavaScript. Native plugin menurunkan kunci AES melalui HKDF-HMAC-SHA-256 dan mengenkripsi/dekripsi pesan menggunakan AES-256-GCM.
- AAD mengikat `pair_id`, `message_id`, `sender_id`, `recipient_id`, `key_version`, dan tipe pesan. Perubahan metadata menyebabkan tag GCM gagal diverifikasi.
- Public key DER dan fingerprint SHA-256 saja yang disimpan di database. Private key tidak diekspor.
- Token/sesi Supabase disegel memakai kunci AES Android Keystore; Capacitor Preferences hanya menampung nonce dan ciphertext sesi.
- UI login akun backend, daftar fingerprint, konfirmasi verifikasi terpisah, pesan kosong, kirim teks, dan pembaruan Realtime ditambahkan.
- SQL memberi RLS untuk keanggotaan, public key, verifikasi fingerprint, dan pesan ciphertext. `messages` tidak memiliki kolom plaintext dan tidak diberi policy UPDATE/DELETE.
- Chat ditolak di browser preview. Jalur E2EE hanya dibuka di APK Android resmi.

## Persyaratan perangkat dan batas keamanan

**Android 12 / API 31 atau lebih baru** diwajibkan untuk ECDH melalui Android Keystore (`PURPOSE_AGREE_KEY`). Tidak ada fallback ke private key yang bisa diekspor. Perangkat lebih lama harus gagal tertutup.

Setiap pengguna hanya didukung dengan satu perangkat/kunci pada Fase 2. Rotasi kunci, multi-device, recovery riwayat, ratchet, dan forward secrecy belum diimplementasikan. Ini berarti pencurian private key statis dapat membahayakan ciphertext lama yang masih tersedia; aplikasi belum boleh diklaim setara dengan messenger yang memiliki ratchet dan audit independen.

Jika kunci lokal hilang atau fingerprint lokal berbeda dari database, chat dihentikan. Jangan menghapus atau mengganti kunci secara otomatis. Rotasi/reset harus memakai prosedur terverifikasi pada fase audit.

Fingerprint berisi 64 karakter hex SHA-256. Pengguna harus membandingkan semua karakternya melalui kanal lain yang tepercaya (misalnya langsung atau panggilan yang sudah dipercaya). Jangan menyetujui fingerprint hanya karena muncul di aplikasi yang sama; server yang dikompromikan bisa mencoba mengganti public key.

## Menyiapkan dua akun

1. Pada Supabase Dashboard project ini, pastikan hanya ada dua akun Auth yang kamu kelola: Hamid dan Nur. Buat akun terlebih dahulu melalui **Authentication → Users** bila belum ada. Gunakan kata sandi kuat berbeda dan simpan secara privat. Aplikasi tidak membuka pendaftaran publik dan tidak menyimpan kata sandi.
2. Terapkan migration `supabase/migrations/20261021000000_phase2_e2ee_text_chat.sql` setelah project ACTIVE. CI tidak menyimpan service-role key dan migration ini sengaja tidak menambahkan pengguna otomatis.
3. Seed satu pasangan dan dua membership melalui SQL Editor menggunakan UUID yang benar-benar tampil pada daftar Auth Users. Jangan menebak/mengarang UUID. Bentuk SQL-nya:

   ```sql
   insert into public.pairs (display_name)
   values ('Our Space')
   returning id;
   ```

   Gunakan `id` hasil query itu sebagai `PAIR_ID`, lalu jalankan query kedua:

   ```sql
   insert into public.pair_members (pair_id, user_id, member_name)
   values
     ('PAIR_ID', 'UUID_AUTH_HAMID', 'hamid'),
     ('PAIR_ID', 'UUID_AUTH_NUR', 'nur');
   ```

   Ganti ketiga placeholder dengan UUID dari project yang sama. Jangan membuka `INSERT` untuk tabel membership kepada peran `anon`/`authenticated`; hanya pemilik proyek/admin yang boleh mengubah daftar anggota.
4. Aplikasi memakai URL dan publishable key project yang bersifat publik. Untuk memindahkan build ke project lain, override `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`; **jangan** memasukkan service-role/secret key ke APK, GitHub Variables, file `.env`, atau source client.
5. Masuk ke APK menggunakan akun yang sesuai dengan identitas lokal. Masing-masing HP membuat kunci sendiri. Tunggu kunci pasangan muncul, lalu tukar/cocokkan fingerprint melalui kanal terpisah, verifikasi, dan baru mulai berkirim pesan.

## Pengujian penerimaan

- [ ] `npm test`, build Vite, `npx cap sync android`, dan Gradle `assembleDebug` semuanya sukses pada Actions.
- [ ] Pada Android 12+, key baru dibuat di Android Keystore; public key/fingerprint sama setelah aplikasi ditutup dan dibuka.
- [ ] Android di bawah API 31 tidak bisa mengaktifkan chat E2EE.
- [ ] Login dengan akun ketiga tidak dapat membaca membership, public key, fingerprint, atau pesan.
- [ ] Dua akun yang benar dapat membaca dua membership, tetapi user tidak dapat menambah anggota baru.
- [ ] Pesan tidak dapat dikirim sebelum fingerprint penerima diverifikasi.
- [ ] Hamid mengirim ke Nur dan sebaliknya; pesan terbuka pada penerima dan tetap ciphertext di database.
- [ ] Modifikasi nonce, ciphertext, `message_id`, sender, recipient, key version atau pair ID menyebabkan dekripsi gagal dan isi tidak ditampilkan.
- [ ] Mode pesawat/putus jaringan menghasilkan error tanpa menyimpan plaintext; reconnect mengirim/memuat ciphertext dengan benar.
- [ ] PIN lock/masuk background menghapus teks yang terlihat dari DOM dan menghentikan channel Realtime.

Build CI dan unit test JavaScript tidak membuktikan bahwa Android Keystore bekerja di semua OEM, bahwa proyek Supabase sudah seeded, atau bahwa E2EE berfungsi antara dua perangkat. Checklist tersebut harus diisi setelah uji nyata.
