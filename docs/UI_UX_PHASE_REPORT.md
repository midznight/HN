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

## Belum terbukti
- Cold start sampai PIN <2 detik, respons <100 ms, scroll 60 fps, frame/jank, ukuran build, dan performa pada HP kelas menengah belum diukur.
- Pratinjau tidak menguji native predictive Back, izin, picker Android, simpan galeri, E2EE, notifikasi, panggilan background, atau kuota nyata.
- Alur media sengaja mempertahankan pratinjau + konfirmasi kirim demi mencegah file privat salah kirim. Ini adalah pengecualian terhadap sasaran maksimal dua ketukan dan perlu penilaianmu.

## Pertanyaan untuk pemilik
1. Apakah tanggal jadian memang 12 Agustus 2021, atau tanggal lain? Sampai dikonfirmasi, penghitung waktu tetap nonaktif.
2. Untuk foto/video, apakah kamu lebih memilih konfirmasi kirim yang aman (satu langkah tambahan) atau pengiriman langsung setelah item dipilih dengan risiko salah kirim lebih tinggi?
