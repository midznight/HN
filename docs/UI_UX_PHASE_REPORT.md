# Laporan singkat — Fase desain UI/UX

## Hasil
- Dibuat root DESIGN.md dan preview mandiri di preview-ui/index.html.
- Navigasi target dipangkas ke Obrolan, Kita, Brankas. Setelah PIN, Obrolan menjadi tujuan default; pengaturan berada di Kita dan panggilan berada pada header/alur chat.
- Ditetapkan token Onyx & Champagne yang sudah diukur pada pasangan kontras inti, target sentuh 48 dp, ukuran teks minimum, keadaan gagal/kosong/memuat, dan batas performa.
- Pratinjau menyediakan pilihan skenario PIN, onboarding, verifikasi fingerprint, chat (normal/kosong/memuat/offline/gagal), lampiran, media, voice note, panggilan, Kita, Brankas, dan Pengaturan. Semua konten demo bertanda CONTOH; tidak ada koneksi backend.
- Entry point dan modul runtime aplikasi tidak diubah. Preview terletak di folder terpisah dan tidak masuk ke build Vite yang memakai index.html sebagai entry point.

## Yang diubah dari prototipe
1. Menghapus imitasi desktop/macOS dan nama tab campuran Inggris; mengganti dengan tiga tab khusus pengalaman Android.
2. Mengganti blur/glass besar dengan permukaan solid, batas yang tenang, dan hanya satu tingkat elevasi bila diperlukan.
3. Memastikan waktu pesan selalu tampak pada sentuh dan composer menampilkan tindakan foto, mikrofon, dan kirim.
4. Menghilangkan ketergantungan aset pihak ketiga dari preview; membolehkan zoom teks dan memakai dynamic viewport/safe area.
5. Tidak menampilkan durasi hubungan, countdown, kenangan atau kuota sebagai fakta tanpa data nyata.

## Keputusan pemilik yang dicatat — 21 Oktober 2026
- **Tanggal jadian belum ditetapkan.** Hitung hari bersama, countdown anniversary, dan fitur kenangan yang bergantung pada tanggal tetap nonaktif sampai ada tanggal yang ditentukan pemilik.
- **Foto/video wajib melalui pratinjau dan konfirmasi sebelum dikirim.** Pengguna dapat meninjau pilihan lalu menekan Kirim atau Batal; tidak ada pengiriman otomatis setelah pemilih media.

## Belum terbukti
- Cold start sampai PIN <2 detik, respons <100 ms, scroll 60 fps, frame/jank, ukuran build, dan performa pada HP kelas menengah belum diukur.
- Pratinjau tidak menguji native predictive Back, izin, picker Android, simpan galeri, E2EE, notifikasi, panggilan background, atau kuota nyata.
- Alur media sengaja mempertahankan satu langkah konfirmasi tambahan sebagai trade-off privasi. Ini tidak dianggap cacat dan tidak boleh dihilangkan tanpa keputusan pemilik yang baru.

## Gerbang fase
Pekerjaan saat ini tetap sebatas desain dan pratinjau. Jangan menerapkan desain ke aplikasi rilis, mengubah backend/E2EE, atau memulai fase implementasi berikutnya sebelum pemilik menulis **“lanjut”**.
