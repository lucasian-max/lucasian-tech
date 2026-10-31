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

// Show the plain-link fallback if the iPod module never starts.
// This runs from <head>, so the elements do not exist yet — look them up lazily.
(function () {
  var timer;

  function el(id) {
    return document.getElementById(id);
  }

  function showFallback() {
    clearTimeout(timer);
    var stage = el("stage"), fallback = el("fallback");
    if (stage) stage.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  function showStage() {
    clearTimeout(timer);
    var stage = el("stage"), fallback = el("fallback");
    if (stage) stage.hidden = false;
    if (fallback) fallback.hidden = true;
  }

  window.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "SCRIPT") showFallback();
  }, true);

  if (!window.customElements) {
    showFallback();
    return;
  }

  customElements.whenDefined("web-music-ipod").then(showStage, showFallback);
  timer = setTimeout(showFallback, 6000);
})();
