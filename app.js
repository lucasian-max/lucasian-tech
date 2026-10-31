/* Site content + a loader guard.

   The device is a 336 KB ES module plus a 536 KB JSON data file. On a cold
   cache over a slow link that is several seconds. A fixed timer cannot tell
   "slow" apart from "broken", so this waits on the module's own load/error
   events instead: a slow load shows the spinner, a real failure shows the
   plain link list, and either state can correct the other. */
window.__SITE = {
  projects: [
    { title: "Navidrome",  url: "https://music.lucasian.tech" },
    { title: "Kavita",     url: "https://library.lucasian.tech" },
    { title: "Audiobooks", url: "https://audiobooks.lucasian.tech" },
    { title: "Books",      url: "https://books.lucasian.tech" },
    { title: "Usage",      url: "https://usage.lucasian.tech" },
    { title: "Karakeep",   url: "https://karakeep.lucasian.tech" }
  ],
  apps: [
    { title: "Kavita",    url: "https://library.lucasian.tech" },
    { title: "Books",     url: "https://books.lucasian.tech" },
    { title: "Usage",     url: "https://usage.lucasian.tech" },
    { title: "Karakeep",  url: "https://karakeep.lucasian.tech" },
    { title: "Timer",     url: "https://timer.lucasian.tech" },
    { title: "Study",     url: "https://study.lucasian.tech" },
    { title: "Tasks",     url: "https://tasks.lucasian.tech" },
    { title: "Manga",     url: "https://manga.lucasian.tech" }
  ]
};

(function () {
  // Runs from <head>, so the shell elements do not exist yet.
  var ready = false;
  var backstop;

  function el(id) {
    return document.getElementById(id);
  }

  function state(show) {
    var stage = el("stage"), fallback = el("fallback");
    if (stage) stage.hidden = !show;
    if (fallback) fallback.hidden = show;
    document.documentElement.setAttribute("data-ipod", show ? "ok" : "failed");
  }

  function showDevice() {
    if (ready) return;
    ready = true;
    clearTimeout(backstop);
    state(true);
  }

  function showLinks() {
    if (ready) return;
    clearTimeout(backstop);
    state(false);
  }

  window.addEventListener(
    "error",
    function (e) {
      if (e.target && e.target.tagName === "SCRIPT") showLinks();
    },
    true
  );

  if (!window.customElements || !("attachShadow" in Element.prototype)) {
    showLinks();
    return;
  }

  customElements.whenDefined("web-music-ipod").then(showDevice, showLinks);

  // Backstop for a script that never fires load or error at all (blocked by an
  // extension, killed mid-flight). Generous, because a slow load is not a fault.
  backstop = setTimeout(showLinks, 20000);
})();
