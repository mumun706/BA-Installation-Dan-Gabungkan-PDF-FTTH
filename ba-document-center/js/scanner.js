// Document Scanner: pengolahan gambar dan editor crop empat sudut.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const MAX_SIDE = 2200; // batas sisi terpanjang agar HP tidak kehabisan memori

  const defaults = () => ({
    corners: [[0, 0], [1, 0], [1, 1], [0, 1]], // 0..1: kiri atas, kanan atas, kanan bawah, kiri bawah
    rotation: 0, brightness: 0, contrast: 0, filter: "asli",
  });

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  const toBlob = (canvas) => new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gambar gagal diproses."))), "image/jpeg", 0.9));

  async function decode(blob, maxSide) {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG transparan menjadi putih
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  }

  /* ---------- Meluruskan perspektif ---------- */
  // Selesaikan sistem persamaan linear (eliminasi Gauss).
  function solve(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }

  function isFull(c) {
    const full = defaults().corners;
    return c.every((p, i) => Math.abs(p[0] - full[i][0]) < 0.002 && Math.abs(p[1] - full[i][1]) < 0.002);
  }

  // Bentuk harus segi empat cembung dengan urutan sudut yang benar.
  function isValid(c) {
    return c.every((p, i) => {
      const q = c[(i + 1) % 4];
      const r = c[(i + 2) % 4];
      return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) > 0.001;
    });
  }

  function warp(source, corners) {
    if (isFull(corners)) return source;
    const sw = source.width;
    const sh = source.height;
    const q = corners.map(([x, y]) => [x * (sw - 1), y * (sh - 1)]);
    const len = (a, b) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1]);
    const w = Math.max(2, Math.round(Math.max(len(0, 1), len(3, 2))));
    const h = Math.max(2, Math.round(Math.max(len(0, 3), len(1, 2))));
    // Cari matriks yang memetakan titik hasil (u,v) ke titik foto (x,y).
    const dst = [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]];
    const A = [];
    const b = [];
    dst.forEach(([u, v], i) => {
      const [x, y] = q[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    });
    const m = solve(A, b);
    const src = source.getContext("2d").getImageData(0, 0, sw, sh).data;
    const out = makeCanvas(w, h);
    const ctx = out.getContext("2d");
    const image = ctx.createImageData(w, h);
    const d = image.data;
    for (let v = 0, k = 0; v < h; v++) {
      for (let u = 0; u < w; u++, k += 4) {
        const z = m[6] * u + m[7] * v + 1;
        const x = Math.min(sw - 1, Math.max(0, (m[0] * u + m[1] * v + m[2]) / z));
        const y = Math.min(sh - 1, Math.max(0, (m[3] * u + m[4] * v + m[5]) / z));
        const x0 = x | 0;
        const y0 = y | 0;
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = x - x0;
        const fy = y - y0;
        for (let c = 0; c < 3; c++) {
          const top = src[(y0 * sw + x0) * 4 + c] * (1 - fx) + src[(y0 * sw + x1) * 4 + c] * fx;
          const bottom = src[(y1 * sw + x0) * 4 + c] * (1 - fx) + src[(y1 * sw + x1) * 4 + c] * fx;
          d[k + c] = top * (1 - fy) + bottom * fy;
        }
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return out;
  }

  /* ---------- Brightness, contrast, filter ---------- */
  function adjust(canvas, edit) {
    if (!edit.brightness && !edit.contrast && edit.filter === "asli") return canvas;
    const { width: w, height: h } = canvas;
    const ctx = canvas.getContext("2d");
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    const boost = edit.filter === "warna" ? 1.2 : 1;
    const factor = (1 + edit.contrast / 100) * boost;
    const shift = edit.brightness * 1.28 + (edit.filter === "warna" ? 8 : 0);
    const level = (v) => (v - 128) * factor + 128 + shift;

    for (let i = 0; i < d.length; i += 4) {
      let r = level(d[i]);
      let g = level(d[i + 1]);
      let b = level(d[i + 2]);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      if (edit.filter === "warna") {
        r = gray + (r - gray) * 1.25;
        g = gray + (g - gray) * 1.25;
        b = gray + (b - gray) * 1.25;
      } else if (edit.filter !== "asli") {
        r = g = b = gray;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }

    if (edit.filter === "hp") {
      // Hitam putih adaptif: dibandingkan dengan rata-rata sekitarnya, tahan bayangan.
      const sum = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          row += d[(y * w + x) * 4];
          sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
        }
      }
      const half = Math.max(8, Math.round(Math.max(w, h) / 40));
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - half);
        const y1 = Math.min(h, y + half + 1);
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - half);
          const x1 = Math.min(w, x + half + 1);
          const total = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
          const mean = total / ((x1 - x0) * (y1 - y0));
          const i = (y * w + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = d[i] < mean * 0.85 || d[i] < 70 ? 0 : 255;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function rotate(canvas, degrees) {
    if (!degrees) return canvas;
    const swap = degrees % 180 !== 0;
    const out = makeCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  // Hasil akhir satu gambar. Foto asli tidak pernah ditimpa.
  async function render(blob, edit, maxSide) {
    const source = await decode(blob, maxSide || MAX_SIDE);
    return rotate(adjust(warp(source, edit.corners), edit), edit.rotation);
  }

  /* ---------- Editor ---------- */
  let current = null; // { blob, edit, done }
  let timer = null;
  let version = 0;

  function drawShape() {
    const c = current.edit.corners;
    $("sc-polygon").setAttribute("points", c.map(([x, y]) => x * 100 + "," + y * 100).join(" "));
    $("sc-stage").querySelectorAll(".handle").forEach((h, i) => {
      h.style.left = c[i][0] * 100 + "%";
      h.style.top = c[i][1] * 100 + "%";
    });
    const ok = isValid(c);
    $("sc-stage").classList.toggle("invalid", !ok);
    $("sc-save").disabled = !ok;
    $("sc-message").textContent = ok ? "" : "Posisi sudut saling bersilangan. Geser kembali.";
  }

  function preview() {
    clearTimeout(timer);
    const mine = ++version;
    timer = setTimeout(async () => {
      if (!current || !isValid(current.edit.corners)) return;
      try {
        const canvas = await render(current.blob, current.edit, 700);
        if (mine === version) $("sc-result").replaceChildren(canvas);
      } catch (error) {
        $("sc-message").textContent = error.message;
      }
    }, 200);
  }

  function syncControls() {
    $("sc-brightness").value = current.edit.brightness;
    $("sc-contrast").value = current.edit.contrast;
    $("sc-filter").value = current.edit.filter;
  }

  // Buka editor. done(edit) dipanggil hanya jika pengguna menekan Simpan.
  async function open(blob, edit, done) {
    current = { blob, edit: structuredClone(edit), done };
    const source = await decode(blob, 1200);
    $("sc-stage").style.setProperty("--ratio", source.width / source.height);
    $("sc-source").replaceChildren(source);
    $("sc-result").replaceChildren();
    syncControls();
    drawShape();
    $("sc-editor").showModal();
    preview();
  }

  const stage = $("sc-stage");
  stage.querySelectorAll(".handle").forEach((handle, index) => {
    const move = (x, y) => {
      current.edit.corners[index] = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
      drawShape();
      preview();
    };
    handle.addEventListener("pointerdown", (e) => {
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const box = stage.getBoundingClientRect();
      move((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
    });
    handle.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step) return;
      e.preventDefault();
      const [x, y] = current.edit.corners[index];
      move(x + step[0] * 0.005, y + step[1] * 0.005);
    });
  });

  ["brightness", "contrast", "filter"].forEach((key) => {
    $("sc-" + key).addEventListener("input", (e) => {
      current.edit[key] = key === "filter" ? e.target.value : Number(e.target.value);
      preview();
    });
  });
  const turn = (degrees) => {
    current.edit.rotation = (current.edit.rotation + degrees + 360) % 360;
    preview();
  };
  $("sc-left").addEventListener("click", () => turn(-90));
  $("sc-right").addEventListener("click", () => turn(90));
  $("sc-reset").addEventListener("click", () => {
    current.edit = defaults();
    syncControls();
    drawShape();
    preview();
  });
  $("sc-cancel").addEventListener("click", () => $("sc-editor").close());
  $("sc-save").addEventListener("click", () => {
    current.done(current.edit);
    $("sc-editor").close();
  });
  $("sc-editor").addEventListener("close", () => {
    version++;
    clearTimeout(timer);
    current = null;
    $("sc-source").replaceChildren();
    $("sc-result").replaceChildren();
  });

  window.Scanner = { defaults, render, open, toBlob, decode, MAX_SIDE };
})();
