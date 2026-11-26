# BA Document Center

Aplikasi web statis untuk membuat BA dan menggabungkan dokumen. Tanpa backend dan database.

## Menjalankan
Cara terbaik (preview tampil di halaman): jalankan server lokal di folder ini,
`python -m http.server 8000`, lalu buka http://localhost:8000.
Jika `index.html` diklik dua kali, preview dibuka lewat tab baru.

Template BA sudah tertanam di `js/template-data.js`, jadi ikut terpublikasi.
Gunakan repositori privat dan pastikan perusahaan mengizinkan.

## Struktur
- `index.html`    : kerangka halaman
- `css/style.css` : tampilan
- `js/app.js`     : navigasi dan peringatan sebelum keluar
- `js/ba-template.js`  : posisi kolom dan penulisan ke PDF
- `js/ba-generator.js` : formulir satu halaman, preview, unduh
- `js/template-data.js` : template resmi (base64)
- `js/scanner.js`      : crop 4 sudut, perspektif, filter
- `js/pdf-merger.js`   : daftar halaman, gabung, preview, unduh
- `vendor/`       : pdf-lib 1.17.1 dan PDF.js 6.2.108 (disimpan lokal)

## Progres
- [x] Tahap 1: struktur dan halaman utama
- [x] Tahap 2: BA Generator
- [x] Tahap 3: Document Scanner
- [x] Tahap 4: PDF Merger
- [ ] Tahap 5: pengujian HP asli (browser otomatis sudah)
- [ ] Tahap 6: deployment Vercel

## Deploy ke Vercel
Cara CLI (perlu Node.js), jalankan di folder ini:

    npx vercel          # login dan buat proyek (alamat uji)
    npx vercel --prod   # terbitkan

Framework preset: Other. Tanpa build command. Output: folder ini.
Alternatif: unggah folder ke repositori GitHub privat, lalu Import di vercel.com.

## Daftar uji di HP
- [ ] Isi BA, unduh, buka hasilnya
- [ ] Ambil foto dokumen, crop 4 sudut, simpan
- [ ] Gabungkan PDF BA + foto tanda tangan + PDF pendukung
- [ ] Ubah urutan, hapus, putar
- [ ] Coba tutup halaman saat belum mengunduh
