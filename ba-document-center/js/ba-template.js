// Menulis isian di atas template BA NON-STANDAR asli.
// Semua angka dalam satuan point PDF, "top" diukur dari tepi ATAS halaman.
// Angka ini hasil pengukuran template; jika template diganti, ukur ulang.
(function () {
  "use strict";

  const PAGE_W = 595.25;
  const PAGE_H = 842;
  const SIZE = 10.5;

  // Kolom isian di kanan tabel: [top, bottom]
  const ROWS = {
    nomor:   [99.5, 115.0],  tanggal: [115.0, 130.3], wo:  [130.3, 145.5],
    nama:    [214.1, 229.3], ktp:     [229.3, 244.6],
    alamat:  [244.6, 259.8], telp:    [259.8, 275.3],
    ioh:     [303.4, 318.6], amt:     [346.9, 374.9],
  };
  const LABELS = {
    nomor: "Nomor BA", tanggal: "Hari / Tanggal", wo: "Nomor Work Order", nama: "Nama lengkap",
    ktp: "No. Identitas", alamat: "Alamat instalasi", telp: "No. telepon",
    ioh: "Nama / Jabatan IOH", amt: "Nama / Jabatan AMT",
    fat: "Daya optik FAT/ODP", panjang: "Panjang rute", tiang: "Jumlah tiang",
    rumah: "Jumlah rumah", ont: "Daya terima ONT",
    ttdPelanggan: "Nama tanda tangan Pelanggan", ttdIoh: "Nama tanda tangan IOH", ttdAmt: "Nama tanda tangan AMT",
  };
  // Titik-titik pada bagian C: top teks
  const DOTS = { fat: 565.8, panjang: 593.8, tiang: 609.3, rumah: 637.3, ont: 652.6 };
  // Kotak centang: tepi atas kotak
  const RELAKS_TOP = [418.0, 446.25, 469.5, 488.0]; // halaman 1
  const LAMP_TOP = [308.5, 327.0, 345.5, 364.0];    // halaman 2
  // Kurung tanda tangan: [x awal, x akhir]
  const SIGN = { ttdPelanggan: [81, 193.5], ttdIoh: [241.6, 354.1], ttdAmt: [402.4, 514.9] };

  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  function checkCharacters(font, text, label) {
    const bad = Array.from(text).filter((ch) => {
      try { font.encodeText(ch); return false; } catch (e) { return true; }
    });
    if (bad.length) throw new Error(label + ": karakter tidak didukung (" + bad.join(" ") + ").");
  }

  // Cari ukuran huruf terbesar yang muat dalam satu baris.
  function fitSize(font, text, width, max, min) {
    for (let s = max; s >= min; s -= 0.25) {
      if (font.widthOfTextAtSize(text, s) <= width) return s;
    }
    return null;
  }

  // Bagi teks menjadi dua baris; null jika tidak muat.
  function twoLines(font, text, width, size) {
    const words = text.split(" ");
    for (let i = words.length - 1; i > 0; i--) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      if (font.widthOfTextAtSize(a, size) <= width && font.widthOfTextAtSize(b, size) <= width) return [a, b];
    }
    return null;
  }

  async function load(bytes) {
    const doc = await PDFLib.PDFDocument.load(bytes);
    const pages = doc.getPages();
    const sizeOk = pages.every((p) => Math.abs(p.getWidth() - PAGE_W) < 2 && Math.abs(p.getHeight() - PAGE_H) < 2);
    if (pages.length !== 2 || !sizeOk) {
      throw new Error("File ini bukan template BA Non-Standar (harus 2 halaman A4).");
    }
    return doc;
  }

  async function fill(templateBytes, data) {
    const { StandardFonts, PDFName, PDFRef, rgb } = PDFLib;
    const doc = await load(templateBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const [p1, p2] = doc.getPages();
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);

    // Hapus anotasi (misalnya Nomor BA lama yang diketik lewat editor PDF).
    [p1, p2].forEach((page) => {
      const annots = page.node.Annots();
      if (!annots) return;
      annots.asArray().forEach((ref) => { if (ref instanceof PDFRef) doc.context.delete(ref); });
      page.node.delete(PDFName.of("Annots"));
    });

    const write = (page, text, x, baselineTop, size) =>
      page.drawText(text, { x, y: PAGE_H - baselineTop, size, font, color: black });

    const get = (key) => {
      const text = clean(data[key]);
      checkCharacters(font, text, LABELS[key]);
      return text;
    };
    const tooLong = (key) => new Error(LABELS[key] + " terlalu panjang untuk kolom template. Persingkat.");

    Object.keys(ROWS).forEach((key) => {
      const text = get(key);
      if (!text) return;
      const [top, bottom] = ROWS[key];
      const x = 247.3;
      const width = 533 - x;
      const size = fitSize(font, text, width, SIZE, 8);
      if (size) return write(p1, text, x, top + 11.3, size);
      // Tidak muat satu baris: coba dua baris dengan huruf kecil.
      for (let s = 7.5; s >= 6; s -= 0.25) {
        const lines = twoLines(font, text, width, s);
        if (lines) {
          write(p1, lines[0], x, top + 6.8, s);
          write(p1, lines[1], x, top + 6.8 + s, s);
          return;
        }
      }
      throw tooLong(key);
    });

    Object.keys(DOTS).forEach((key) => {
      const text = get(key);
      if (!text) return; // kosong: titik-titik asli tetap tampil
      const top = DOTS[key];
      const x0 = 247.1;
      const width = 294.9 - x0;
      const size = fitSize(font, text, width, SIZE, 7);
      if (!size) throw tooLong(key);
      p1.drawRectangle({ x: x0 - 0.3, y: PAGE_H - (top + 10.8), width: width + 0.6, height: 10.8, color: white });
      write(p1, text, x0 + (width - font.widthOfTextAtSize(text, size)) / 2, top + 8.2, size);
    });

    const tick = (page, top) => {
      const y = PAGE_H - top;
      const line = (ax, ay, bx, by) =>
        page.drawLine({ start: { x: ax, y: y - ay }, end: { x: bx, y: y - by }, thickness: 1.4, color: black });
      line(67.9, 4.6, 70.1, 6.9);
      line(70.1, 6.9, 74.2, 1.6);
    };
    RELAKS_TOP.forEach((top, i) => { if (data.relaks[i]) tick(p1, top); });
    LAMP_TOP.forEach((top, i) => { if (data.lampiran[i]) tick(p2, top); });

    Object.keys(SIGN).forEach((key) => {
      const name = get(key);
      if (!name) return;
      const [x0, x1] = SIGN[key];
      const center = (x0 + x1) / 2;
      const text = "(" + name + ")";
      const size = fitSize(font, text, 152, SIZE, 6.5);
      if (!size) throw tooLong(key);
      p2.drawRectangle({ x: x0 - 0.5, y: PAGE_H - 528.6, width: x1 - x0 + 1, height: 11.4, color: white });
      write(p2, text, center - font.widthOfTextAtSize(text, size) / 2, 525.8, size);
    });

    return doc.save();
  }

  window.BATemplate = { load, fill };
})();
