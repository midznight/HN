# Laporan singkat — Fase desain UI/UX

## Hasil terbaru
- Iterasi visual dilakukan setelah masukan pemilik: versi awal dinilai masih terlalu kaku dan membosankan.
- Bahasa visual diperbarui menjadi **Warm Coral / Rose / Blush**: judul editorial untuk area emosional, bubble chat asimetris, latar chat bertitik yang sangat halus, hero “Kita” dengan gradasi coral/rose, tombol primer berkontras tinggi, dan navigasi aktif yang lebih terasa.
- Preview tetap berdiri sendiri di `preview-ui/index.html`, tanpa library/aset eksternal, dan tidak memanggil backend. Seluruh media/pesan di dalamnya tetap konten CONTOH.
- Token warna dan pasangan kontras di `DESIGN.md` diperbarui supaya sesuai dengan visual refresh. Angka kontras adalah hasil perhitungan untuk pasangan spesifik yang dicantumkan; komposisi pada perangkat dan gradien tetap perlu diuji.

## Struktur pengalaman
- Navigasi target tetap tiga tab: Obrolan, Kita, Brankas. Setelah PIN, Obrolan menjadi tujuan default; pengaturan berada di Kita dan panggilan berada pada header/alur chat.
- Preview memuat skenario chat normal/kosong/memuat/offline/gagal, lampiran, pratinjau media, unggahan terputus, voice note, panggilan masuk/keluar/aktif/berakhir, Kita, Brankas, penampil media, simpan galeri, PIN, onboarding, fingerprint, konflik kunci, dan pengaturan.
- Ukuran sentuh minimal ditargetkan 48 dp, teks bisa di-zoom, layout memakai dynamic viewport/safe area, serta menghormati reduce motion.
- File preview dipisahkan dari entry point rilis. **Tidak ada perubahan pada E2EE, database, Edge Function, APK, atau perilaku produksi.**

## Yang dijaga dari keputusan sebelumnya
- **Tanggal jadian belum ditetapkan.** Hitung hari, countdown anniversary, dan kenangan yang bergantung pada tanggal tidak boleh muncul sebagai fakta.
- **Foto/video harus melalui pratinjau dan konfirmasi sebelum dikirim.** Pengguna dapat memeriksa media sebelum memilih Kirim atau Batal; langkah ini sengaja dipertahankan sebagai keputusan privasi.
- Tidak ada kuota, durasi hubungan, pesan terkirim, atau media demo yang boleh diperlakukan sebagai data produksi.

## Hal yang belum terbukti
- Belum ada pengukuran cold start sampai PIN <2 detik, respons <100 ms, scroll 60 fps, frame/jank, ukuran build, atau performa pada perangkat Android nyata.
- Preview tidak menguji predictive Back native, izin/picker Android, simpan ke galeri, E2EE, notifikasi, panggilan saat aplikasi tertutup, atau kuota penyimpanan.
- Ini adalah iterasi rancangan visual/pratinjau, bukan implementasi ulang aplikasi rilis. Perlu pemeriksaan tampilan langsung pada HP Android, terutama ukuran layar kecil dan tema gelap.

## Gerbang fase
Pekerjaan masih sebatas desain dan pratinjau. Jangan terapkan desain ke aplikasi rilis, mengubah backend/E2EE, atau memulai fase implementasi berikutnya sebelum pemilik menulis **“lanjut”**.
