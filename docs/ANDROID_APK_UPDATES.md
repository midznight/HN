# APK Android: pembaruan tanpa uninstall

GitHub Actions menjalankan build pada runner sementara. Jangan memakai debug keystore default runner untuk APK yang harus dipasang sebagai update, karena kunci debug dapat berubah pada setiap run. Workflow sekarang dirancang menandatangani APK dengan keystore stabil yang disimpan sebagai GitHub Actions Secrets dan menaikkan versionCode setiap build.

## 1. Buat keystore stabil sekali

Gunakan komputer tepercaya yang memiliki Java keytool (biasanya ikut Android Studio). Dari PowerShell:

    keytool -genkeypair -v -keystore our-space-signing.jks -storetype JKS -alias our-space-upload -keyalg RSA -keysize 3072 -validity 10000

Simpan kata sandi keystore dengan aman. Saat keytool meminta kata sandi key alias, tekan Enter untuk memakai kata sandi yang sama. Simpan file our-space-signing.jks sebagai backup offline di lokasi aman. Jangan pernah mengunggah file ini ke repo.

Salin representasi Base64 ke clipboard PowerShell:

    [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\our-space-signing.jks")) | Set-Clipboard

Jangan menempelkan nilai Base64 atau kata sandi di issue, commit, chat, atau file repo.

## 2. Tambahkan empat repository secrets

Buka GitHub → Settings → Secrets and variables → Actions → New repository secret, lalu buat:

| Secret name | Nilai |
|---|---|
| ANDROID_SIGNING_KEYSTORE_BASE64 | Nilai Base64 dari clipboard |
| ANDROID_KEYSTORE_PASSWORD | Kata sandi keystore |
| ANDROID_KEY_ALIAS | our-space-upload |
| ANDROID_KEY_PASSWORD | Kata sandi alias (sama jika Enter dipilih saat membuat key) |

Rahasiakan backup keystore dan kata sandinya. Kehilangan keystore berarti APK berikutnya tidak bisa menjadi update bertanda tangan sama.

## 3. Build APK berikutnya

Buka tab Actions → Build Our Space Android Debug APK → Run workflow, lalu pilih branch phase-2/e2ee-text-chat. Workflow sengaja gagal sebelum menghasilkan APK apabila secrets tersebut belum lengkap; ini mencegah terbitnya APK baru yang kembali bentrok saat update. Setelah secrets tersedia, jalankan workflow lagi.

## 4. Migrasi satu kali dari APK lama — jangan lakukan sebelum APK stabil siap

APK dari build runner sementara yang sudah terpasang mungkin ditandatangani kunci berbeda. Android tidak mengizinkan APK dengan sertifikat berbeda memperbarui instalasi tersebut. Jangan uninstall sekarang; tunggu sampai secrets signing tersedia dan APK baru dengan tanda tangan stabil berhasil dibuat.

Uninstall menghapus data aplikasi lokal, termasuk PIN dan private identity key yang tersimpan di Android Keystore. Server tidak bisa memulihkan private key itu. Jika kunci perangkat sudah terdaftar di Supabase, record public key lama perlu di-reset sebelum login pertama setelah instal ulang; jika tidak, fingerprint baru akan ditolak karena tidak cocok dengan fingerprint lama.

Pemeriksaan pada project saat dokumen ini ditulis menemukan satu public key perangkat Hamid, nol verifikasi fingerprint, dan nol pesan tersimpan. Ini berarti rotasi awal dapat dilakukan tanpa kehilangan riwayat pesan saat ini. Jangan jalankan reset di bawah jika jumlah pesan sudah bukan nol—pesan lama dapat menjadi tidak bisa didekripsi.

Setelah APK stabil berhasil dibuat dan kedua aplikasi lama siap diganti:
1. Jangan buka aplikasi lama lagi. Uninstall aplikasi lama di kedua HP, lalu sebelum login di APK baru, buka Supabase Dashboard → SQL Editor.
2. Jalankan skrip admin berikut untuk menghapus public-key binding lama milik anggota Hamid. Skrip akan berhenti jika konfigurasi bukan tepat satu pasangan atau ada pesan tersimpan.

    do $reset_device_key$
    declare
      target_pair uuid;
      target_user uuid;
      pair_count integer;
    begin
      select count(*) into pair_count
      from public.pair_members
      where member_name = 'hamid';

      if pair_count <> 1 then
        raise exception 'Expected exactly one Hamid membership; no key was reset.';
      end if;

      select pair_id, user_id into target_pair, target_user
      from public.pair_members
      where member_name = 'hamid';

      if exists (select 1 from public.messages where pair_id = target_pair) then
        raise exception 'Messages exist for this pair; stop and review a key-rotation plan.';
      end if;

      delete from public.key_verifications
      where pair_id = target_pair
        and (verifier_user_id = target_user or target_user_id = target_user);

      delete from public.device_keys
      where pair_id = target_pair and user_id = target_user;
    end $reset_device_key$;

3. Pasang APK bertanda tangan stabil di kedua HP, pilih identitas lokal yang benar, lalu login pada masing-masing akun. Kedua HP akan membuat kunci perangkat baru.
4. Bandingkan seluruh fingerprint 64 karakter secara langsung melalui kanal terpisah tepercaya, lalu verifikasi di masing-masing perangkat.

Setelah transisi ini, build berikutnya memakai keystore yang sama dan versionCode yang meningkat sehingga dapat dipasang sebagai pembaruan biasa. Simpan file signing keystore offline dengan aman; kehilangannya berarti APK berikutnya tidak bisa memperbarui instalasi yang ditandatangani dengannya.
