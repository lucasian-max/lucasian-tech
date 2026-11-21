/* Site content + loader guard.
   DEMO BUILD — content and interaction patches from specs/. */

window.__SITE = {
  /* Row 2 — projects, with the outcome carried on the row itself. */
  projects: [
    { title: "Black Hole",   url: "https://iammridul.me/blackhole-pixel/blackhole-pixel.html", value: "pixels" },
    { title: "lucasian.tech", url: "https://lucasian.tech", value: "this site" },
    { title: "Study log",    url: "https://study.iammridul.me", value: "sheets" }
  ],

  /* Row 5 — Contacts. Real 4th-gen home for a person's details.
     NOTE: address/handles are placeholders — replace before deploying. */
  contacts: [
    { title: "Email",  url: "mailto:hey@lucasian.tech" },
    { title: "GitHub", url: "https://github.com/lucasian-max" }
  ],

  /* Row 2 — Self-Hosted. `group` files the app, `purpose` is what the row
     reveals on selection. Neither is invented: purpose is what the service
     is, group is a folder. */
  selfHosted: [
    { title: "Navidrome",  url: "https://music.lucasian.tech",      group: "Media",   purpose: "music" },
    { title: "Audiobooks", url: "https://audiobooks.lucasian.tech", group: "Media",   purpose: "audio" },
    { title: "Kavita",     url: "https://library.lucasian.tech",    group: "Reading", purpose: "comics" },
    { title: "Manga",      url: "https://manga.lucasian.tech",      group: "Reading", purpose: "manga" },
    { title: "Books",      url: "https://books.lucasian.tech",      group: "Reading", purpose: "books" },
    { title: "Karakeep",   url: "https://karakeep.lucasian.tech",   group: "Reading", purpose: "links" },
    { title: "Timer",      url: "https://timer.lucasian.tech",      group: "Tools",   purpose: "focus" },
    { title: "Study",      url: "https://study.lucasian.tech",      group: "Tools",   purpose: "notes" },
    { title: "Tasks",      url: "https://tasks.lucasian.tech",      group: "Tools",   purpose: "tasks" }
  ],

  /* Only what's true. Omit a key and the row disappears.
     services = the list above (counted at runtime if omitted).
     domains  = lucasian.tech + iammridul.me, both verified live.
     servers  = pending: see the note in the reply. */
  server: {
    domains: 2,   // lucasian.tech + iammridul.me — both verified live from outside
    servers: 3    // YOUR number, not verified. I could not reach the Mac to check.
  },

  /* Row 4 — About. Six rows total including the centred name. */
  about: {
    name: "Mridul Vijay",
    facts: [
      { title: "Makes", value: "web, tools" },
      { title: "Into",  value: "rockets, AI" },
      { title: "From",  value: "NSW · 16" },
      { title: "Sleep", value: "optional" }
    ],
    links: [],
    device: { version: "2644.1.0" }
  },

  /* Row 3 — Now Playing: a state in progress, not a WIP page. */
  now: [
    { title: "Making",    value: "this site", url: "https://lucasian.tech" },
    { title: "Learning",  value: "Rust",      url: "https://www.rust-lang.org" },
    { title: "Reading",   value: "manga",     url: "https://manga.lucasian.tech" },
    { title: "Listening", value: "music",     url: "https://music.lucasian.tech" },
    { title: "Hosting",   value: "10 apps",   url: "https://usage.lucasian.tech" },
    { title: "Updated",   value: "Nov 2026" }
  ]
};

/* ---------------- loader guard (unchanged behaviour) ---------------- */
(function () {
  var ready = false;
  var backstop;

  function el(id) { return document.getElementById(id); }

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

  window.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "SCRIPT") showLinks();
  }, true);

  if (!window.customElements || !("attachShadow" in Element.prototype)) {
    showLinks();
    return;
  }

  customElements.whenDefined("web-music-ipod").then(showDevice, showLinks);

  /* Backstop cut from 20s to 5s: five seconds of a beautiful switched-off
     iPod beats twenty of a black page. */
  backstop = setTimeout(showLinks, 5000);
})();

/* ---------------- touch: tap the ring quadrants ---------------- */
(function () {
  function start() { var host = document.getElementById("ipod"); if (host) wireHost(host); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  function wireHost(host) {
    function wire() {
      var root = host.shadowRoot;
      if (!root) return;
      var wheel = root.querySelector(".scroll-wheel");
      if (!wheel || wheel.__touchWired) return;
      wheel.__touchWired = true;

      /* --- injected presentation: hover, cursor, focus, demo state --- */
      var fix = document.createElement("style");
      fix.textContent = [
        ".screen-body { background: #d7dfe8 !important; }",
        ".menu { background: #d7dfe8 !important; }",
        ".menu-items { background: #d7dfe8 !important; }",
        ".menu-items { margin-top: 0 !important; height: 181px !important; }",
        ".menu-item.selected:not([data-action=info]) { color: #dfe6ee !important; }",
        ".menu-item.selected:not([data-action=info]) .item-title { color: inherit !important; }",
        ".menu-item.selected:not([data-action=info]) .chevron { border-color: #dfe6ee !important; }",

        /* the wheel is a thing you TURN, not a link you click */
        ".scroll-wheel { cursor: grab; }",
        ".scroll-wheel:active { cursor: grabbing; }",

        /* quadrants: light the part, never move the selection */
        ".wheel-button { cursor: default; }",
        ".wheel-button svg { transition: fill 120ms linear; }",
        ".wheel-button:hover svg { fill: #6f6f6f; }",
        ".select-button:hover { box-shadow: 0 0 1px 1px #909090; }",

        /* focus ring lives on the glass, not as a web outline */
        ".menu-items:focus-visible { outline: 2px solid #484647 !important; outline-offset: -1px; }",
        ".menu-item.selected:focus-visible { outline: none !important; }",

        /* value column: only the selected row reveals its value, so the list
           stays clean and the metadata lands like a status line. Info rows
           (About facts, Now) always show theirs. */
        ".menu-item .item-value { margin-left: auto; padding-left: 8px; }",
        ".menu-item[data-action=link] .item-value { visibility: hidden; }",
        ".menu-item[data-action=link].selected .item-value { visibility: visible; }"
      ].join("\n");
      root.appendChild(fix);

      /* Five redundant keyboard stops before the list -> zero.
         The component re-applies tabindex on every render, so re-apply. */
      var clearStops = function () {
        root.querySelectorAll('.wheel-button, .select-button').forEach(function (b) {
          if (b.getAttribute("tabindex") !== "-1") b.setAttribute("tabindex", "-1");
        });
      };
      clearStops();
      new MutationObserver(clearStops).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["tabindex"] });

      var start = null;
      var moved = false;

      wheel.addEventListener("pointerdown", function (e) {
        start = { x: e.clientX, y: e.clientY }; moved = false;
      }, true);

      wheel.addEventListener("pointermove", function (e) {
        if (!start) return;
        var dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (dx * dx + dy * dy > 12 * 12) moved = true;
      }, true);

      wheel.addEventListener("pointerup", function (e) {
        if (!start) return;
        var wasMoved = moved; start = null; moved = false;
        if (wasMoved) return;

        var box = wheel.getBoundingClientRect();
        var cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        if (Math.hypot(dx, dy) < box.width * 0.22) return;

        var action;
        if (Math.abs(dy) > Math.abs(dx)) action = dy < 0 ? ".menu-button" : ".playpause-button";
        else action = dx < 0 ? ".back-button" : ".forward-button";

        var btn = root.querySelector(action);
        if (btn) btn.click();
      }, true);

      /* Mouse wheel / trackpad: the component only turns from a pointer drag
         on the ring, so the most obvious way to scroll — a wheel over the
         device — did nothing at all. Feed the same `wheelscroll` event the
         component emits for a drag, one notch per row. */
      var WHEEL_DEG = 15;       /* component's default dragStepDegrees */
      var PIXELS_PER_ROW = 100; /* Chrome's mouse-wheel notch */
      var acc = 0, lastDir = 0;

      if (!wheel.__wheelWired) {
        wheel.__wheelWired = true;
        host.addEventListener("wheel", function (e) {
          /* ctrl/meta + wheel is pinch-zoom, not a turn */
          if (e.ctrlKey || e.metaKey) return;
          var raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          if (!raw) return;
          e.preventDefault();

          var dir = raw > 0 ? 1 : -1;
          if (dir !== lastDir) { acc = 0; lastDir = dir; }

          var unit;
          if (e.deltaMode === 1) unit = Math.abs(raw) / 3;        /* lines */
          else if (e.deltaMode === 2) unit = Math.abs(raw);       /* pages */
          else unit = Math.abs(raw) / PIXELS_PER_ROW;             /* pixels */
          acc += unit;

          /* trackpad deltas are fractional: 10 x 0.1 must reach 1, not
             0.999999… and get floored back to zero */
          var notches = Math.floor(acc + 1e-3);
          if (notches < 1) return;
          acc -= notches;
          if (notches > 4) notches = 4; /* a fling must not fly past the list */

          for (var i = 0; i < notches; i++) {
            wheel.dispatchEvent(new CustomEvent("wheelscroll", {
              detail: { step: dir, degrees: WHEEL_DEG, speed: 0 }
            }));
          }
        }, { passive: false });
      }
    }

    var tries = 0;
    var timer = setInterval(function () {
      if (host.shadowRoot && host.shadowRoot.querySelector(".scroll-wheel")) {
        clearInterval(timer);
        wire();
        boot(root_ref(host));
      } else if (++tries > 200) {
        clearInterval(timer);
      }
    }, 50);
  }

  function root_ref(host) { return host.shadowRoot; }

  /* ---------------- boot ----------------
     A device waking, not a web intro. The visual runs on load so nobody is
     ever blocked; the startup sound waits for the first deliberate touch,
     because browsers refuse audio before a gesture. */
  function boot(root) {
    if (!root) return;
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = false;
    try { seen = sessionStorage.getItem("lucasian:boot") === "1"; } catch (e) {}

    var list = root.querySelector(".menu-items");
    var wheel = root.querySelector(".scroll-wheel");
    var screen = root.querySelector(".screen-body");
    if (!list || !screen) return;

    /* No boot sequence. The device is simply on, like a photograph of one.
       Only the backlight comes up, and only if motion is allowed. */
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      screen.animate(
        [{ filter: "brightness(.45)" }, { filter: "brightness(1)" }],
        { duration: 220, easing: "ease-out", fill: "backwards" }
      );
    }

    /* the backlight falls after 15s of no input, like real hardware; any
       gesture wakes it. This is the cheapest fix for "reads as a screenshot". */
    var idle = null;
    var brighten = function () { screen.style.filter = "brightness(1)"; };
    var resetIdle = function () {
      if (idle) clearTimeout(idle);
      brighten();
      idle = setTimeout(function () { screen.style.filter = "brightness(.62)"; }, 15000);
    };
    screen.style.transition = "filter 900ms ease-in-out";
    ["pointerdown", "keydown", "input"].forEach(function (ev) {
      document.addEventListener(ev, resetIdle, { passive: true });
    });
    if (wheel) {
      ["wheelscroll", "wheeldragstart"].forEach(function (ev) {
        wheel.addEventListener(ev, resetIdle, { passive: true });
      });
    }
    resetIdle();

    /* ---------------- Wake ----------------
       A drive spinning up and an open fifth. Every layer deliberately carries
       energy above 500Hz: the first version sat at 110-220Hz, which laptop and
       phone speakers cannot reproduce, so it was silent on real hardware. */
    var played = false;   /* per page load: every visit is a power cycle */
    var wake = function () {
      if (played) return;
      played = true;
      if (document.hidden) return;   /* not looking, not listening */
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ctx = new AC();
        if (ctx.state === "suspended") ctx.resume();
        var t0 = ctx.currentTime + 0.02;
        var master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);

        /* 1. the latch: a bright tick, audible on any speaker */
        var nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
        var nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        var tick = ctx.createBufferSource(); tick.buffer = nb;
        var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
        var tg = ctx.createGain();
        tg.gain.setValueAtTime(0.35, t0);
        tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
        tick.connect(hp).connect(tg).connect(master);
        tick.start(t0); tick.stop(t0 + 0.06);

        /* 2. the platter: noise sweeping 500 -> 2400Hz */
        var sb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.55), ctx.sampleRate);
        var sd = sb.getChannelData(0);
        for (var j = 0; j < sd.length; j++) sd[j] = Math.random() * 2 - 1;
        var spin = ctx.createBufferSource(); spin.buffer = sb;
        var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(500, t0 + 0.02);
        bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.42);
        var sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, t0 + 0.02);
        sg.gain.linearRampToValueAtTime(0.16, t0 + 0.08);
        sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.58);
        spin.connect(bp).connect(sg).connect(master);
        spin.start(t0 + 0.02); spin.stop(t0 + 0.6);

        /* 3. the chord: A3 / E4 / A4 — an open fifth, no third */
        [[220, 0.34, "sine"], [329.63, 0.20, "triangle"], [440, 0.11, "sine"]]
          .forEach(function (v) {
            var o = ctx.createOscillator();
            o.type = v[2]; o.frequency.value = v[0];
            var g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0 + 0.10);
            g.gain.linearRampToValueAtTime(v[1], t0 + 0.115);
            g.gain.setValueAtTime(v[1], t0 + 0.16);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
            var lp = ctx.createBiquadFilter();
            lp.type = "lowpass"; lp.frequency.value = 5000; lp.Q.value = 0.7;
            o.connect(g).connect(lp).connect(master);
            o.start(t0 + 0.10); o.stop(t0 + 0.86);
          });
        setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1400);
      } catch (e) {}
    };

    /* any first gesture on the page powers it on — clicking the empty studio
       should wake the machine, not silently do nothing */
    document.addEventListener("pointerdown", wake, { once: true, capture: true });
    document.addEventListener("keydown", wake, { once: true, capture: true });
  }
})();


/* ---------------- more wear ----------------
   Three hairlines either side of the existing nick. Enough to catch a light
   edge-on; not enough to look like a texture. */
(function () {
  function go() {
    var set = document.querySelector(".set");
    if (!set || document.querySelector(".scratch")) return;
    var marks = [
      { l: "80.9%", t: "86.5%", w: 1, h: 7, r: -24, c: "rgba(0,0,0,.16)", s: "1px 0 0 rgba(255,255,255,.14)" },
      { l: "83.4%", t: "11.8%", w: 1, h: 10, r: 12, c: "rgba(255,255,255,.28)", s: "none" },
      { l: "14.9%", t: "30.6%", w: 1, h: 6, r: -8, c: "rgba(0,0,0,.13)", s: "none" }
    ];
    marks.forEach(function (m, i) {
      var d = document.createElement("div");
      d.className = "scratch";
      d.setAttribute("aria-hidden", "true");
      d.style.cssText = "position:absolute;left:" + m.l + ";top:" + m.t + ";width:" + m.w + "px;height:" + m.h +
        "px;transform:rotate(" + m.r + "deg);background:" + m.c + ";box-shadow:" + m.s +
        ";pointer-events:none;z-index:3";
      set.appendChild(d);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
})();

/* ---------------- tilt ----------------
   Drag the chassis and the device leans under your hand. Dragging the wheel is
   still a scroll, so anything on the click wheel or the list is ignored. */
(function () {
  var MAX = 11;
  function clamp(v) { return Math.max(-MAX, Math.min(MAX, v)); }
  function wire() {
    var host = document.getElementById("ipod");
    if (!host || host.__tilt) return;
    host.__tilt = true;
    var dragging = false, sx = 0, sy = 0;
    function onDevice(e) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var c = path[i] && path[i].className;
        if (typeof c === "string" && /scroll-wheel|select-button|wheel-button|menu-items/.test(c)) return false;
      }
      return true;
    }
    host.addEventListener("pointerdown", function (e) {
      if (!onDevice(e)) return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      host.style.transition = "transform 55ms linear";
    });
    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      /* yaw only. Pitch made the device appear to rise and fall; the object
         should stay planted and turn like it is sitting on a desk. */
      host.style.setProperty("--tilt-y", clamp((e.clientX - sx) / 9).toFixed(2) + "deg");
    });
    window.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      host.style.transition = "transform 420ms cubic-bezier(.22,.61,.36,1)";
      host.style.setProperty("--tilt-y", "0deg");
    });
  }
  var n = 0;
  var iv = setInterval(function () {
    var h = document.getElementById("ipod");
    if (h && h.shadowRoot) { clearInterval(iv); wire(); }
    else if (++n > 200) clearInterval(iv);
  }, 50);
})();

/* ---------------- distressed variant ----------------
   Product-retouch wear, not a texture: age lives in the plastic (a cream
   cast), the silhouette (polished edges), and a handful of marks placed where
   a hand actually goes. Nothing procedural, nothing grimy. */
(function () {
  function go() {
    var set = document.querySelector(".set");
    if (!set || document.querySelector(".wear")) return;

    var css = document.createElement("style");
    css.textContent = [
      ".wear{position:absolute;pointer-events:none;z-index:4}",
      /* aged ABS: a cream veil over the polycarbonate, multiplied */
      ".wear-tint{left:3%;right:3%;top:0.4%;bottom:0.2%;background:#efe3c8;opacity:.05;mix-blend-mode:multiply;border-radius:26px}",
      /* edges get polished by handling: a bright lip top, a dark one bottom */
      ".wear-edge-t{left:6%;right:6%;top:0.5%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);opacity:.5}",
      ".wear-edge-b{left:7%;right:7%;bottom:1.2%;height:1px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.28),transparent);opacity:.6}",
      /* one soft handling mark on the glass */
      ".wear-smudge{left:32%;top:9%;width:26%;height:9%;border-radius:50%;background:radial-gradient(ellipse at 50% 50%,rgba(255,255,255,.30),transparent 70%);opacity:.35;filter:blur(2px)}"
    ].join("");
    document.head.appendChild(css);

    function mark(cls, style) {
      var d = document.createElement("div");
      d.className = "wear " + cls;
      d.setAttribute("aria-hidden", "true");
      d.style.cssText = "position:absolute;pointer-events:none;z-index:4;" + style;
      set.appendChild(d);
    }

    mark("wear-tint", "");
    mark("wear-edge-t", "");
    mark("wear-edge-b", "");
    mark("wear-smudge", "");

    /* hand-placed marks, not a pattern */
    var marks = [
      { l: "17.8%", t: "8.9%", w: 1, h: 5, r: 32, c: "rgba(0,0,0,.14)", s: "none" },
      { l: "78.4%", t: "18.2%", w: 1, h: 8, r: -14, c: "rgba(0,0,0,.12)", s: "none" },
      { l: "84.1%", t: "63.0%", w: 2, h: 3, r: 41, c: "rgba(0,0,0,.20)", s: "0 1px 0 rgba(255,255,255,.22)" },
      { l: "21.0%", t: "88.4%", w: 1, h: 6, r: -29, c: "rgba(0,0,0,.15)", s: "none" },
      { l: "75.6%", t: "91.2%", w: 1, h: 4, r: 8, c: "rgba(255,255,255,.34)", s: "none" },
      { l: "12.4%", t: "54.0%", w: 1, h: 9, r: 3, c: "rgba(0,0,0,.09)", s: "none" },
      { l: "87.2%", t: "40.5%", w: 1, h: 3, r: -35, c: "rgba(0,0,0,.16)", s: "none" }
    ];
    marks.forEach(function (m) {
      mark("scratch", "left:" + m.l + ";top:" + m.t + ";width:" + m.w + "px;height:" + m.h +
        "px;transform:rotate(" + m.r + "deg);background:" + m.c + ";box-shadow:" + m.s);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
})();

