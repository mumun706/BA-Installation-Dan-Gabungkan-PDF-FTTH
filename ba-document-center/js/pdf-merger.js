// Daftar halaman, urutan, penggabungan, preview, dan unduh.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const A4 = [595.28, 841.89];

  let pages = []; // { type:"image", blob, edit, thumb, name } atau { type:"pdf", source, index, rotation, thumb, name }
  let busy = false;
  let result = null; // PDF gabungan terakhir (Uint8Array)
  let resultUrl = null;
  let pdfjsPromise = null;

  function loadPdfjs() {
    if (!pdfjsPromise) {
      const url = (path) => new URL("vendor/pdfjs/" + path, document.baseURI).href;
      pdfjsPromise = import(url("pdf.min.mjs")).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = url("pdf.worker.min.mjs");
        return lib;
      });
    }
    return pdfjsPromise;
  }

  // Render halaman PDF menjadi canvas. each(canvas, nomor) dipanggil per halaman.
  async function renderPdf(bytes, width, each) {
    const lib = await loadPdfjs();
    const task = lib.getDocument({
      data: bytes.slice(),
      standardFontDataUrl: new URL("vendor/pdfjs/standard_fonts/", document.baseURI).href,
    });
    try {
      const pdf = await task.promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        each(canvas, n);
      }
    } finally {
      await task.destroy();
    }
  }

  function status(text, isError) {
    $("mg-status").textContent = text;
    $("mg-status").classList.toggle("error", Boolean(isError));
  }

  // Setiap perubahan membuat preview lama tidak berlaku.
  function changed() {
    result = null;
    $("mg-preview").replaceChildren();
    App.setDirty("merger", pages.length > 0);
    draw();
  }

  function setBusy(value) {
    busy = value;
    $("view-scanner").querySelectorAll("#mg-camera, #mg-files, #mg-list button, #mg-make, #mg-download, #mg-clear")
      .forEach((el) => { el.disabled = value; });
  }

  /* ---------- Tambah file ---------- */
  async function thumbnail(blob, edit) {
    return (await Scanner.render(blob, edit, 300)).toDataURL("image/jpeg", 0.7);
  }

  async function addImage(file) {
    // Simpan salinan yang sudah diperkecil dan orientasinya sudah benar.
    const blob = await Scanner.toBlob(await Scanner.decode(file, Scanner.MAX_SIDE));
    const edit = Scanner.defaults();
    pages.push({ type: "image", blob, edit, thumb: await thumbnail(blob, edit), name: file.name });
  }

  async function addPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let doc;
    try {
      doc = await PDFLib.PDFDocument.load(bytes);
    } catch (error) {
      throw new Error(/encrypt/i.test(error.message)
        ? "PDF berpassword atau terkunci tidak didukung." : "File PDF rusak atau tidak bisa dibaca.");
    }
    const source = { bytes };
    const added = doc.getPages().map((_, index) =>
      ({ type: "pdf", source, index, rotation: 0, thumb: null, name: file.name }));
    pages.push(...added);
    try {
      await renderPdf(bytes, 220, (canvas, n) => { added[n - 1].thumb = canvas.toDataURL("image/jpeg", 0.7); });
    } catch (error) {
      console.warn("Thumbnail PDF tidak tersedia", error);
    }
  }

  async function addFiles(files) {
    if (busy || !files.length) return;
    setBusy(true);
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      status("Memproses " + (i + 1) + " dari " + files.length + "…");
      try {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) await addPdf(file);
        else if (/^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name)) await addImage(file);
        else throw new Error("Format tidak didukung (hanya JPG, PNG, PDF).");
      } catch (error) {
        errors.push(file.name + ": " + error.message);
      }
    }
    setBusy(false);
    changed();
    status(errors.length ? errors.join(" ") : pages.length + " halaman siap.", errors.length > 0);
  }

  /* ---------- Daftar halaman ---------- */
  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    changed();
  }

  function button(label, title, action, disabled) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.disabled = Boolean(disabled);
    b.addEventListener("click", action);
    return b;
  }

  function editImage(page) {
    Scanner.open(page.blob, page.edit, async (edit) => {
      page.edit = edit;
      page.thumb = await thumbnail(page.blob, edit);
      changed();
    }).catch((error) => status(error.message, true));
  }

  function draw() {
    const items = pages.map((page, i) => {
      const li = document.createElement("li");
      const frame = document.createElement("div");
      frame.className = "thumb";
      if (page.thumb) {
        const img = document.createElement("img");
        img.src = page.thumb;
        img.alt = "Halaman " + (i + 1);
        if (page.type === "pdf" && page.rotation) img.style.transform = "rotate(" + page.rotation + "deg)";
        frame.append(img);
      } else {
        frame.textContent = "PDF hal. " + (page.index + 1);
      }
      const label = document.createElement("p");
      label.textContent = (i + 1) + ". " + page.name;
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(
        button("↑", "Naikkan halaman " + (i + 1), () => move(i, -1), i === 0),
        button("↓", "Turunkan halaman " + (i + 1), () => move(i, 1), i === pages.length - 1),
        page.type === "image"
          ? button("Potong", "Potong dan atur halaman " + (i + 1), () => editImage(page))
          : button("Putar", "Putar halaman " + (i + 1), () => {
              page.rotation = (page.rotation + 90) % 360;
              changed();
            }),
        button("Hapus", "Hapus halaman " + (i + 1), () => {
          pages.splice(i, 1);
          changed();
          status(pages.length ? pages.length + " halaman siap." : "");
        }),
      );
      li.append(frame, label, actions);
      return li;
    });
    $("mg-list").replaceChildren(...items);
    $("mg-output").hidden = pages.length === 0;
  }

  /* ---------- Gabungkan ---------- */
  async function build() {
    const out = await PDFLib.PDFDocument.create();
    const loaded = new Map();

    // Salin semua halaman dari satu file sekaligus agar font tidak terduplikasi.
    const copies = new Map();
    for (const source of new Set(pages.filter((p) => p.type === "pdf").map((p) => p.source))) {
      loaded.set(source, await PDFLib.PDFDocument.load(source.bytes));
      const indices = pages.filter((p) => p.source === source).map((p) => p.index);
      const copied = await out.copyPages(loaded.get(source), indices);
      copies.set(source, new Map(indices.map((n, i) => [n, copied[i]])));
    }

    for (let i = 0; i < pages.length; i++) {
      const item = pages[i];
      status("Menggabungkan halaman " + (i + 1) + " dari " + pages.length + "…");
      if (item.type === "pdf") {
        const page = copies.get(item.source).get(item.index);
        const angle = page.getRotation().angle;
        out.addPage(page);
        if (item.rotation) page.setRotation(PDFLib.degrees((angle + item.rotation) % 360));
      } else {
        const canvas = await Scanner.render(item.blob, item.edit);
        const blob = await Scanner.toBlob(canvas);
        const image = await out.embedJpg(await blob.arrayBuffer());
        // Kertas A4, orientasi mengikuti gambar, proporsi gambar dipertahankan.
        const size = image.width > image.height ? [A4[1], A4[0]] : A4;
        const page = out.addPage(size);
        const scale = Math.min(size[0] / image.width, size[1] / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, { x: (size[0] - w) / 2, y: (size[1] - h) / 2, width: w, height: h });
      }
    }
    return out.save();
  }

  async function showPreview() {
    if (busy || !pages.length) return;
    setBusy(true);
    const box = $("mg-preview");
    box.replaceChildren();
    try {
      result = await build();
      try {
        await renderPdf(result, 900, (canvas) => box.append(canvas));
      } catch (error) {
        console.warn(error);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(new Blob([result], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = resultUrl;
        link.target = "_blank";
        link.textContent = "Buka preview PDF di tab baru";
        box.replaceChildren(link);
      }
      status("Preview siap: " + pages.length + " halaman.");
    } catch (error) {
      status("Gagal menggabungkan: " + error.message, true);
    }
    setBusy(false);
    draw();
  }

  async function download() {
    if (busy || !pages.length) return;
    setBusy(true);
    try {
      result = result || (await build());
      const url = URL.createObjectURL(new Blob([result], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = ($("mg-filename").value.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "_") || "Dokumen_Gabungan") + ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      App.setDirty("merger", false);
      status("PDF diunduh. Cek folder Unduhan.");
    } catch (error) {
      status("Gagal membuat PDF: " + error.message, true);
    }
    setBusy(false);
    draw();
  }

  $("mg-files").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    await addFiles(files);
  });
  // Foto dari kamera: tambahkan, lalu langsung buka layar potong.
  $("mg-camera").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    const before = pages.length;
    await addFiles(files);
    if (pages.length > before) editImage(pages[pages.length - 1]);
  });
  $("mg-make").addEventListener("click", showPreview);
  $("mg-download").addEventListener("click", download);
  $("mg-clear").addEventListener("click", () => {
    if (!confirm("Hapus semua halaman?")) return;
    pages = [];
    changed();
    status("");
  });
})();
