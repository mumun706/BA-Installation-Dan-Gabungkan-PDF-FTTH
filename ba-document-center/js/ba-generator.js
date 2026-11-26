// Formulir satu halaman, preview, dan unduh BA NON-STANDAR.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("ba-form");
  const templateBytes = Uint8Array.from(atob(window.BA_TEMPLATE_BASE64), (c) => c.charCodeAt(0));

  let renderId = 0;
  let pdfjs = null;
  let blobUrl = null;
  let filenameEdited = false;

  const value = (name) => form.elements[name].value.trim();
  const checks = (name) => Array.from(form.querySelectorAll('[name="' + name + '"]'), (c) => c.checked);
  // Buang satuan yang ikut diketik karena sudah tercetak di template.
  const number = (name) => value(name).replace(/\s*(dbm|meter|titik|rumah|m)$/i, "");

  function readData() {
    const data = {};
    ["nomor", "tanggal", "wo", "nama", "ktp", "alamat", "telp", "ioh", "amt",
      "ttdPelanggan", "ttdIoh", "ttdAmt"].forEach((k) => { data[k] = value(k); });
    ["fat", "panjang", "tiang", "rumah", "ont"].forEach((k) => { data[k] = number(k); });
    data.relaks = checks("relaks");
    data.lampiran = checks("lampiran");
    return data;
  }

  /* ---------- Peringatan (tidak memblokir) ---------- */
  function opticalWarning(name, limit) {
    const text = number(name).replace(",", ".").replace("−", "-");
    const box = $("warn-" + name);
    const n = Number(text);
    let message = "";
    if (text && !Number.isFinite(n)) message = "Isi angka saja, contoh: -18,5";
    else if (text && n > 0) message = "Nilai daya optik biasanya negatif. Periksa tanda minus.";
    else if (text && n < limit) message = "Di bawah syarat (≥ " + limit + " dBm).";
    box.textContent = message;
  }

  function emptyFields() {
    const data = readData();
    const labels = { nomor: "Nomor BA", tanggal: "Hari/Tanggal", wo: "Nomor WO", nama: "Nama pelanggan",
      ktp: "KTP", alamat: "Alamat", telp: "Telepon", ioh: "IOH", amt: "AMT" };
    const missing = Object.keys(labels).filter((k) => !data[k]).map((k) => labels[k]);
    if (!data.relaks.includes(true)) missing.push("Jenis relaksasi");
    return missing;
  }

  /* ---------- Nama file ---------- */
  function suggestFilename() {
    if (filenameEdited) return;
    $("ba-filename").value = ["BA", value("nomor"), value("nama")].filter(Boolean).join("_")
      .replace(/^BA_BA/i, "BA").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "BA_Non_Standar";
  }

  /* ---------- Nama tanda tangan mengikuti data sebelumnya ---------- */
  const mirrors = { nama: "ttdPelanggan", ioh: "ttdIoh", amt: "ttdAmt" };

  /* ---------- Preview ---------- */
  function setStatus(text, isError) {
    $("ba-status").textContent = text;
    $("ba-status").classList.toggle("error", Boolean(isError));
  }

  // Isian berubah: preview lama tidak berlaku lagi.
  function clearPreview() {
    renderId++;
    $("ba-pages").replaceChildren();
    setStatus("");
  }

  function showMissing() {
    const missing = emptyFields();
    $("ba-missing").textContent = missing.length ? "Masih kosong: " + missing.join(", ") + "." : "";
  }

  async function renderPreview() {
    const id = ++renderId;
    const box = $("ba-pages");
    box.replaceChildren();
    showMissing();
    setStatus("Membuat preview…");
    let bytes;
    try {
      bytes = await BATemplate.fill(templateBytes, readData());
    } catch (error) {
      if (id !== renderId) return;
      box.replaceChildren();
      return setStatus(error.message, true);
    }
    if (id !== renderId) return;

    try {
      if (!pdfjs) {
        pdfjs = await import(new URL("vendor/pdfjs/pdf.min.mjs", document.baseURI).href);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", document.baseURI).href;
      }
      const task = pdfjs.getDocument({
        data: bytes.slice(),
        standardFontDataUrl: new URL("vendor/pdfjs/standard_fonts/", document.baseURI).href,
      });
      const pdf = await task.promise;
      const canvases = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute("aria-label", "Preview halaman " + i);
        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        canvases.push(canvas);
      }
      await task.destroy();
      if (id !== renderId) return;
      box.replaceChildren(...canvases);
      setStatus("Periksa kedua halaman sebelum mengunduh.");
    } catch (error) {
      console.warn(error);
      if (id !== renderId) return;
      // Cadangan, misalnya saat index.html dibuka langsung tanpa server.
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.target = "_blank";
      link.textContent = "Buka preview PDF di tab baru";
      box.replaceChildren(link);
      setStatus("Preview di halaman tidak bisa dimuat.");
    }
  }

  /* ---------- Unduh ---------- */
  async function download() {
    showMissing();
    try {
      const bytes = await BATemplate.fill(templateBytes, readData());
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = ($("ba-filename").value.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "_") || "BA_Non_Standar") + ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      App.setDirty("ba", false);
      setStatus("PDF diunduh. Cek folder Unduhan.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  /* ---------- Event ---------- */
  form.addEventListener("input", (event) => {
    const el = event.target;
    if (Object.values(mirrors).includes(el.name)) el.dataset.manual = "1";
    const target = form.elements[mirrors[el.name]];
    if (target && !target.dataset.manual) target.value = el.value;
    opticalWarning("fat", -20);
    opticalWarning("ont", -24);
    App.setDirty("ba", true);
    suggestFilename();
    clearPreview();
    if ($("ba-missing").textContent) showMissing();
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  $("ba-filename").addEventListener("input", () => { filenameEdited = true; });
  $("ba-preview").addEventListener("click", renderPreview);
  $("ba-download").addEventListener("click", download);
})();
