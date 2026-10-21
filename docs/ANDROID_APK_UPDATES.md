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

## 4. Migrasi satu kali dari APK lama

APK dari build runner sementara yang sudah terpasang mungkin ditandatangani kunci berbeda. Android tidak mengizinkan APK dengan sertifikat berbeda memperbarui instalasi tersebut. Untuk perpindahan pertama ke tanda tangan stabil, uninstall aplikasi lama sekali lalu pasang APK dari workflow baru. Setelah itu, build berikutnya memakai keystore yang sama dan versionCode yang meningkat sehingga dapat dipasang sebagai pembaruan biasa.

Uninstall menghapus data aplikasi lokal, termasuk PIN dan kunci identitas yang tersimpan di Android Keystore. Sebelum langkah satu kali ini, pastikan tidak ada data lokal yang masih diperlukan. Jangan pernah menghapus data aplikasi saat mencoba mengatasi error E2EE kecuali memang siap melakukan prosedur reset identitas yang terverifikasi.
