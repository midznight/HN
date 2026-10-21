# FCM tanpa kunci service account: Workload Identity Federation

Dokumen ini mengganti petunjuk membuat/mengunggah service-account JSON. Tujuannya adalah mengirim FCM HTTP v1 tanpa menyimpan private key Google yang berumur panjang di Supabase.

## Model autentikasi

Edge Function menukar JWT sesi Supabase pemanggil menjadi token federasi Google melalui Security Token Service (STS), lalu meminta access token service account berumur 10 menit melalui IAM Credentials API. Service account hanya diberi hak mengirim FCM. Kunci JSON permanen tidak dibuat dan tidak disimpan.

**Batas keamanan yang perlu dipahami:** provider dibatasi hanya ke dua UUID akun Hamid dan Nur. Karena token JWT akun tersebut menjadi subject token federation, siapa pun yang menguasai sesi salah satu akun tepercaya secara teknis dapat menukar tokennya di luar Edge Function dan memperoleh token service account berjangka pendek dengan hak FCM. Karena itu:
- jangan menambahkan principal lain ke provider atau service account;
- beri service account hanya peran `Firebase Cloud Messaging API Admin`, tanpa Editor/Owner;
- jangan gunakan service account ini untuk membaca database atau resource lain;
- untuk isolasi lebih kuat sehingga end-user tidak bisa melakukan impersonasi di luar Edge Function, pindahkan pengiriman FCM ke runtime terkelola seperti Cloud Run dengan identitas runtime. Cloud Run dapat memerlukan penautan akun penagihan; jangan aktifkan jalur itu tanpa memeriksa batas biaya terlebih dahulu.

Push tetap gagal-tertutup jika salah satu konfigurasi atau pemeriksaan gagal. Notifikasi tidak memuat isi chat.

## 1. Prasyarat

1. Project Firebase tetap pada plan Spark; gunakan project yang sama dengan `google-services.json`.
2. Pastikan project Supabase ini menggunakan JWT signing key asimetris (ES256 atau RS256). Di Supabase Dashboard buka **Authentication → JWT Signing Keys**; endpoint JWKS project harus memuat public key aktif. Workload Identity Federation tidak dapat memverifikasi JWT HS256 dengan public JWKS.
3. Di [Google Cloud Console](https://console.cloud.google.com/), pilih project Google Cloud yang sama dengan Firebase.
4. Catat **Project ID** dan **Project number** pada Project settings. Jangan menaruh token atau private key di repo.

## 2. Ambil UUID dua akun privat

Di Supabase Dashboard → **SQL Editor**, jalankan query baca-saja berikut dan catat UUID hanya untuk konfigurasi Google Cloud:

```sql
select user_id, member_name
from public.pair_members
where member_name in ('hamid', 'nur');
```

Pastikan hasilnya tepat dua akun tepercaya. **Jangan memasukkan UUID nyata ke repository publik**; gunakan langsung ketika membuat condition dan binding IAM.

## 3. Buat service account tanpa membuat key

Di Google Cloud Console:
1. **IAM & Admin → Service Accounts → Create service account**.
2. Gunakan nama `our-space-fcm-sender`.
3. Untuk least privilege, buka **IAM & Admin → Roles → Create custom role** pada project Firebase dan buat role `Our Space FCM Sender` yang hanya memiliki permission `cloudmessaging.messages.create`. Google mencatat permission ini didukung untuk custom roles ([daftar permission](https://cloud.google.com/iam/docs/custom-roles-permissions-support)); hak tersebut cukup untuk memanggil endpoint FCM send yang digunakan fungsi. Lalu berikan custom role tersebut kepada service account. Jangan berikan Owner, Editor, Firebase Admin atau akses database.
4. Jika pembuatan custom role diblokir oleh organisasi atau permission tidak diterima, jangan menaikkan role ke Owner/Editor. Gunakan role bawaan paling sempit yang disetujui administrator, pahami bahwa `roles/firebasecloudmessaging.admin` juga memberi hak pengelolaan topic subscription.
5. Jangan membuka tab Keys untuk membuat key. Kita tidak memerlukan JSON.

Di **APIs & Services → Library**, pastikan API berikut aktif:
- Firebase Cloud Messaging API (`fcm.googleapis.com`)
- Security Token Service API (`sts.googleapis.com`)
- IAM Service Account Credentials API (`iamcredentials.googleapis.com`)

## 4. Buat Workload Identity Pool dan provider OIDC

Di **IAM & Admin → Workload Identity Federation**, buat pool:
- Pool ID: `supabase-our-space` (atau ID unik yang tersedia)
- Location: `global`

Tambahkan provider:
- Type: **OpenID Connect (OIDC)**
- Provider ID: `supabase-auth` (atau ID unik yang tersedia)
- Issuer URL: `https://sajlpngmpkizwjbarxlj.supabase.co/auth/v1`
- Allowed audience: `authenticated`
- Attribute mapping:
  - `google.subject` → `assertion.sub`
  - `attribute.role` → `assertion.role`

**Attribute condition** harus membatasi pemanggil ke dua UUID tepat dari langkah 2. Ganti placeholder di bawah, jangan menyalin kata placeholder secara literal:

```cel
assertion.aud == 'authenticated' &&
assertion.role == 'authenticated' &&
assertion.sub in ['UUID_HAMID', 'UUID_NUR']
```

Issuer URL harus sama persis dengan claim `iss` token Supabase project, dan `aud`/algoritma token harus sesuai dengan konfigurasi yang aktif. Jika salah satu pemeriksaan tidak cocok, jangan melonggarkan condition secara luas; hentikan dan periksa JWT Signing Keys dan claim token yang benar.

Setelah provider dibuat, catat resource name berikut. Gunakan **Project number**, bukan project ID:

```text
//iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/supabase-our-space/providers/supabase-auth
```

## 5. Izinkan hanya dua subject melakukan impersonasi terbatas

Buka halaman service account `our-space-fcm-sender` → **Permissions → Grant access**. Tambahkan dua principal satu per satu, satu untuk setiap UUID akun, dengan peran **Workload Identity User** (`roles/iam.workloadIdentityUser`).

Principal untuk akun pertama:

```text
principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/supabase-our-space/subject/UUID_HAMID
```

Principal untuk akun kedua:

```text
principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/supabase-our-space/subject/UUID_NUR
```

Jangan memberi `roles/iam.workloadIdentityUser` ke seluruh pool; gunakan principal per-subject seperti di atas. Provider condition dan binding per-subject keduanya harus membatasi akses.

## 6. Isi Supabase Edge Function secrets

Buka [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/sajlpngmpkizwjbarxlj/functions/secrets), lalu simpan:

| Secret | Nilai |
|---|---|
| `GOOGLE_WIF_AUDIENCE` | Resource name provider dari langkah 4, diawali `//iam.googleapis.com/...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account, misalnya `our-space-fcm-sender@PROJECT_ID.iam.gserviceaccount.com` |
| `FCM_PROJECT_ID` | Project ID Firebase yang cocok dengan konfigurasi Android |
 
Tidak ada nilai yang memakai private key atau JSON service account. Hapus secret lama `FCM_SERVICE_ACCOUNT_JSON` jika pernah dibuat dan tidak dipakai oleh layanan lain.

## 7. Verifikasi sebelum mengaktifkan push

1. Deploy Edge Function versi repo yang memakai Workload Identity Federation.
2. Jalankan workflow Android debug dan pastikan secret GitHub `FIREBASE_ANDROID_CONFIG_BASE64` berisi konfigurasi Android dari project Firebase yang benar.
3. Pastikan status push belum `ready` jika tiga secret WIF belum lengkap. Setelah secrets tersedia, uji endpoint status dengan akun privat yang sah.
4. Tes pengiriman Hamid → Nur dan Nur → Hamid, serta akun bukan anggota, fingerprint belum diverifikasi, pesan lama, token invalid, dan kegagalan jaringan.
5. Pastikan push selalu generik (judul `Our Space`, teks `Ada pesan baru menunggu.`) dan tidak memuat plaintext, ciphertext, message ID, nama file, atau metadata chat.

Status `ready` mencoba pertukaran token federasi dan impersonasi access token sementara, tetapi tidak mengirim notifikasi FCM. Pengujian pengiriman nyata pada kedua perangkat masih wajib.
