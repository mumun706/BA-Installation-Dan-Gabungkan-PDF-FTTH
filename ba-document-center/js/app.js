// Inti aplikasi: navigasi halaman dan peringatan sebelum keluar.
(function () {
  "use strict";

  const views = document.querySelectorAll("[data-view]");
  const navLinks = document.querySelectorAll("[data-nav]");

  // Halaman ditentukan oleh bagian setelah tanda # pada alamat,
  // sehingga tombol "kembali" di HP tetap berfungsi.
  function showView(moveFocus) {
    const requested = location.hash.slice(1);
    const exists = Array.from(views).some((v) => v.dataset.view === requested);
    const name = exists ? requested : "beranda";

    views.forEach((view) => {
      view.hidden = view.dataset.view !== name;
    });
    navLinks.forEach((link) => {
      if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (moveFocus) {
      window.scrollTo(0, 0);
      document.querySelector('[data-view="' + name + '"] h1').focus();
    }
  }

  // Daftar fitur yang punya pekerjaan belum diunduh.
  // Tahap berikutnya memanggil: App.setDirty("ba", true / false)
  const dirty = new Set();

  window.App = {
    setDirty(feature, isDirty) {
      if (isDirty) dirty.add(feature);
      else dirty.delete(feature);
    },
  };

  window.addEventListener("beforeunload", (event) => {
    if (dirty.size === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("hashchange", () => showView(true));
  showView(false);
})();
