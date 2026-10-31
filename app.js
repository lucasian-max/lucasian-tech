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
(function () {
  var settled = false;

  function fail() {
    if (settled) return;
    settled = true;
    var stage = document.getElementById("stage");
    var fallback = document.getElementById("fallback");
    if (stage) stage.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  window.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "SCRIPT") fail();
  }, true);

  if (window.__ipodFailed) fail();
  else if (!window.customElements) fail();
  else customElements.whenDefined("web-music-ipod").then(function () {
    settled = true;
  }, fail);

  setTimeout(fail, 6000);
})();
