window.__SITE = {
  projects: [
    {
      slug: "black-hole",
      title: "Black Hole",
      facts: [
        { title: "What", value: "pixel black hole" }
      ],
      links: [
        { title: "Launch demo", url: "https://iammridul.me/blackhole-pixel/blackhole-pixel.html", value: "live" },
        { title: "Source", url: "https://github.com/lucasian-max/blackhole-pixel", value: "GitHub" }
      ]
    },
    {
      slug: "spotify-display",
      title: "Spotify Display",
      facts: [
        { title: "What", value: "now playing" }
      ],
      links: [
        { title: "Source", url: "https://github.com/lucasian-max/Spotify-Display", value: "GitHub" }
      ]
    },
    {
      slug: "lucasian-tech",
      title: "lucasian.tech",
      facts: [
        { title: "What", value: "this website" }
      ],
      links: [
        { title: "About this site", target: "about" },
        { title: "Source", url: "https://github.com/lucasian-max/lucasian-tech", value: "GitHub" }
      ]
    }
  ],

  about: {
    name: "Mridul Vijay",
    facts: [
      { title: "Into", value: "rockets, AI" },
      { title: "From", value: "NSW" },
      { title: "Learning", value: "Rust" }
    ],
    links: [],
    device: { version: "2644.2.0" }
  },

  contacts: [
    { title: "Email", url: "mailto:hey@lucasian.tech", value: "hey@" },
    { title: "GitHub", url: "https://github.com/lucasian-max", value: "lucasian-max" }
  ]
};

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
  backstop = setTimeout(showLinks, 5000);
})();

(function () {
  function start() {
    var host = document.getElementById("ipod");
    if (host) wireHost(host);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  function wireHost(host) {
    function wire() {
      var root = host.shadowRoot;
      if (!root) return;
      var wheel = root.querySelector(".scroll-wheel");
      if (!wheel || wheel.__touchWired) return;
      wheel.__touchWired = true;

      var fix = document.createElement("style");
      fix.textContent = [
        ".screen-body { background: #d7dfe8 !important; }",
        ".menu { background: #d7dfe8 !important; }",
        ".menu-items { background: #d7dfe8 !important; margin-top: 0 !important; height: 181px !important; }",
        ".menu-item:not([data-action=info]) { cursor: pointer; }",
        ".menu-item:not([data-action=info]):not(.selected):hover { background: rgba(72, 70, 71, 0.11); }",
        ".menu-item.selected:not([data-action=info]) { color: #dfe6ee !important; }",
        ".menu-item.selected:not([data-action=info]) .item-title { color: inherit !important; }",
        ".menu-item.selected:not([data-action=info]) .chevron { border-color: #dfe6ee !important; }",
        ".play-icon { cursor: pointer; }",
        ".scroll-wheel { cursor: grab; }",
        ".scroll-wheel:active { cursor: grabbing; }",
        ".wheel-button { cursor: pointer; }",
        ".wheel-button svg { transition: fill 120ms linear; }",
        ".wheel-button:hover svg { fill: #585858; }",
        ".select-button { cursor: pointer; }",
        ".select-button:hover { box-shadow: 0 0 1px 1px #8c8c8c; }",
        ".menu-items:focus-visible { outline: 2px solid #484647 !important; outline-offset: -1px; }",
        ".menu-item.selected:focus-visible { outline: none !important; }",
        ".menu-item .item-value { margin-left: auto; padding-left: 8px; min-width: 0; max-width: 80%; overflow: hidden; text-overflow: ellipsis; }",
        ".menu-item[data-action=link] .item-value { visibility: hidden; }",
        ".menu-item[data-action=link].selected .item-value { visibility: visible; }",
        ".menu-item, .wheel-button, .select-button { -webkit-tap-highlight-color: transparent; }",
        ".menu-items { touch-action: pan-y !important; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }"
      ].join("\n");
      root.appendChild(fix);

      var clearStops = function () {
        root.querySelectorAll(".wheel-button, .select-button").forEach(function (b) {
          if (b.getAttribute("tabindex") !== "-1") b.setAttribute("tabindex", "-1");
        });
      };
      clearStops();
      new MutationObserver(clearStops).observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["tabindex"]
      });

      root.addEventListener("click", function (e) {
        var target = e.target;
        if (!target || !target.closest) return;

        var playIcon = target.closest(".play-icon");
        if (playIcon && window.__IPOD_BRIDGE) {
          window.__IPOD_BRIDGE.openNowPlaying();
          quietHint();
          return;
        }

        var item = target.closest(".menu-item");
        if (!item || item.getAttribute("data-action") === "info") return;
        var list = item.parentElement;
        if (!list) return;
        var lists = root.querySelectorAll(".menu-items");
        if (lists.length > 1 && lists[lists.length - 1] !== list) return;
        var items = Array.prototype.slice.call(list.querySelectorAll(".menu-item"));
        var idx = items.indexOf(item);
        if (idx < 0 || !window.__IPOD_BRIDGE) return;

        quietHint();
        var screen = window.__IPOD_BRIDGE.getScreen();
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        if (coarse || (screen && screen.getSelectedIndex() === idx)) {
          window.__IPOD_BRIDGE.activateIndex(idx);
        } else {
          window.__IPOD_BRIDGE.selectIndex(idx);
        }
      });

      root.addEventListener("dblclick", function (e) {
        var item = e.target && e.target.closest ? e.target.closest(".menu-item") : null;
        if (!item || item.getAttribute("data-action") === "info") return;
        var list = item.parentElement;
        if (!list) return;
        var lists = root.querySelectorAll(".menu-items");
        if (lists.length > 1 && lists[lists.length - 1] !== list) return;
        var items = Array.prototype.slice.call(list.querySelectorAll(".menu-item"));
        var idx = items.indexOf(item);
        if (idx >= 0 && window.__IPOD_BRIDGE) {
          quietHint();
          window.__IPOD_BRIDGE.activateIndex(idx);
        }
      });

      var startPt = null;
      var moved = false;

      wheel.addEventListener("pointerdown", function (e) {
        startPt = { x: e.clientX, y: e.clientY };
        moved = false;
      }, true);

      wheel.addEventListener("pointermove", function (e) {
        if (!startPt) return;
        var dx = e.clientX - startPt.x, dy = e.clientY - startPt.y;
        if (dx * dx + dy * dy > 12 * 12) moved = true;
      }, true);

      wheel.addEventListener("pointerup", function (e) {
        if (!startPt) return;
        var wasMoved = moved;
        startPt = null;
        moved = false;
        if (wasMoved) {
          quietHint();
          return;
        }

        var box = wheel.getBoundingClientRect();
        var cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        if (Math.hypot(dx, dy) < box.width * 0.22) return;

        var action;
        if (Math.abs(dy) > Math.abs(dx)) action = dy < 0 ? ".menu-button" : ".playpause-button";
        else action = dx < 0 ? ".back-button" : ".forward-button";

        var btn = root.querySelector(action);
        if (btn) {
          quietHint();
          btn.click();
        }
      }, true);

      var WHEEL_DEG = 15;
      var PIXELS_PER_ROW = 90;
      var acc = 0, lastDir = 0;

      if (!wheel.__wheelWired) {
        wheel.__wheelWired = true;
        host.addEventListener("wheel", function (e) {
          if (e.ctrlKey || e.metaKey) return;
          var raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          if (!raw) return;
          e.preventDefault();
          quietHint();

          var dir = raw > 0 ? 1 : -1;
          if (dir !== lastDir) { acc = 0; lastDir = dir; }

          var unit;
          if (e.deltaMode === 1) unit = Math.abs(raw) / 3;
          else if (e.deltaMode === 2) unit = Math.abs(raw);
          else unit = Math.abs(raw) / PIXELS_PER_ROW;
          acc += unit;

          var notches = Math.floor(acc + 1e-3);
          if (notches < 1) return;
          acc -= notches;
          if (notches > 4) notches = 4;

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
        restoreHashRoute();
      } else if (++tries > 200) {
        clearInterval(timer);
      }
    }, 50);
  }

  function quietHint() {
    var hint = document.getElementById("studio-hint");
    if (hint && !hint.classList.contains("is-quiet")) {
      hint.classList.add("is-quiet");
    }
  }

  function restoreHashRoute() {
    var hash = (location.hash || "").replace(/^#\/?/, "").trim();
    if (!hash || !window.__IPOD_BRIDGE) return;
    var parts = hash.split("/");
    var key = parts[0];
    var ctx = parts[1];
    if (key === "projects" && ctx) {
      window.__IPOD_BRIDGE.openScreen("project-detail", ctx);
    } else if (key === "music") {
      window.__IPOD_BRIDGE.openScreen("songs");
    } else if (["songs", "projects", "about", "contacts"].indexOf(key) >= 0) {
      window.__IPOD_BRIDGE.openScreen(key);
    }
  }

  window.addEventListener("ipod:nav", function (e) {
    var d = e.detail || {};
    var next = "";
    if (d.key && d.key !== "main") {
      if (d.key === "project-detail" && d.contextId) {
        next = "#projects/" + encodeURIComponent(d.contextId);
      } else if (d.key === "songs") {
        next = "#music";
      } else {
        next = "#" + encodeURIComponent(d.key);
      }
    }
    try {
      if (location.hash !== next) {
        history.replaceState(null, "", next || location.pathname + location.search);
      }
    } catch (err) {}
  });
})();

(function () {
  function mountWear(rig) {
    if (!rig || rig.querySelector(".wear")) return;

    function add(cls, cssText) {
      var d = document.createElement("div");
      d.className = "wear " + cls;
      d.setAttribute("aria-hidden", "true");
      if (cssText) d.style.cssText = cssText;
      rig.appendChild(d);
    }

    add("wear-tint");
    add("wear-edge-t");
    add("wear-edge-b");
    add("wear-smudge");

    var marks = [
      { l: "80.9%", t: "86.5%", w: 1, h: 7, r: -24, c: "rgba(0,0,0,.15)", s: "1px 0 0 rgba(255,255,255,.14)" },
      { l: "83.4%", t: "11.8%", w: 1, h: 10, r: 12, c: "rgba(255,255,255,.26)", s: "none" },
      { l: "14.9%", t: "30.6%", w: 1, h: 6, r: -8, c: "rgba(0,0,0,.12)", s: "none" },
      { l: "17.8%", t: "8.9%", w: 1, h: 5, r: 32, c: "rgba(0,0,0,.13)", s: "none" },
      { l: "78.4%", t: "18.2%", w: 1, h: 8, r: -14, c: "rgba(0,0,0,.11)", s: "none" },
      { l: "84.1%", t: "63.0%", w: 2, h: 3, r: 41, c: "rgba(0,0,0,.18)", s: "0 1px 0 rgba(255,255,255,.2)" },
      { l: "21.0%", t: "88.4%", w: 1, h: 6, r: -29, c: "rgba(0,0,0,.14)", s: "none" },
      { l: "75.6%", t: "91.2%", w: 1, h: 4, r: 8, c: "rgba(255,255,255,.32)", s: "none" },
      { l: "12.4%", t: "54.0%", w: 1, h: 9, r: 3, c: "rgba(0,0,0,.09)", s: "none" }
    ];
    marks.forEach(function (m) {
      add("scratch", "left:" + m.l + ";top:" + m.t + ";width:" + m.w + "px;height:" + m.h +
        "px;transform:rotate(" + m.r + "deg);background:" + m.c + ";box-shadow:" + m.s);
    });
  }

  function wireTilt() {
    var setEl = document.getElementById("ipod-set");
    var rig = document.getElementById("chassis-rig");
    var host = document.getElementById("ipod");
    if (!setEl || !rig || !host) return;

    mountWear(rig);
    if (rig.__tiltWired) return;
    rig.__tiltWired = true;

    var MAX_Y = 12;
    var MAX_X = 3.5;
    var dragging = false;
    var sx = 0, sy = 0;

    function clamp(v, lim) { return Math.max(-lim, Math.min(lim, v)); }

    function isChassisHit(e) {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var c = path[i] && path[i].className;
        if (typeof c === "string" && /scroll-wheel|select-button|wheel-button|menu-items|play-icon/.test(c)) {
          return false;
        }
      }
      return true;
    }

    function applyTilt(degY, degX) {
      setEl.style.setProperty("--tilt-y", degY.toFixed(2) + "deg");
      setEl.style.setProperty("--tilt-x", degX.toFixed(2) + "deg");
      setEl.style.setProperty("--tilt-y-num", degY.toFixed(2));
      setEl.style.setProperty("--sheen-x", (50 + degY * 2.6).toFixed(1) + "%");
    }

    rig.addEventListener("pointerdown", function (e) {
      if (!isChassisHit(e)) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      rig.classList.add("is-dragging");
    });

    window.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dy = clamp((e.clientX - sx) / 8.5, MAX_Y);
      var dx = clamp(-(e.clientY - sy) / 28, MAX_X);
      applyTilt(dy, dx);
    });

    function release() {
      if (!dragging) return;
      dragging = false;
      rig.classList.remove("is-dragging");
      applyTilt(0, 0);
    }

    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireTilt, { once: true });
  else wireTilt();
})();

(function () {
  var set = document.getElementById("ipod-set");
  if (!set) return;
  var frame = 0;

  function fit() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth;
    var h = vv ? vv.height : window.innerHeight;
    var short = h < 480;
    var topBudget = short && w >= 600 ? 48 : (w < 900 ? 120 : 130);
    var scale = Math.min((w - 12) / 440, (h - topBudget) / 692, 1.8);
    if (!isFinite(scale) || scale < 0.35) scale = 0.35;
    document.documentElement.style.setProperty("--app-height", h + "px");
    document.documentElement.classList.toggle("is-short", short);
    set.style.setProperty("--set-scale", scale.toFixed(3));
  }

  function queue() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }

  fit();
  window.addEventListener("resize", queue);
  window.addEventListener("orientationchange", queue);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", queue);
    window.visualViewport.addEventListener("scroll", queue);
  }
})();

(function () {
  function initHud() {
    var pill = document.getElementById("music-pill");
    var btnToggle = document.getElementById("music-toggle");
    var btnTrack = document.getElementById("music-track");
    var btnNext = document.getElementById("music-next");
    var titleEl = document.getElementById("music-title");
    var artistEl = document.getElementById("music-artist");
    var hintEl = document.getElementById("studio-hint");

    var touchHint = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth <= 640;
    if (hintEl && touchHint) {
      hintEl.textContent = "Tap a row, or spin the wheel";
    }

    function markInteracted() {
      if (hintEl) hintEl.classList.add("is-quiet");
    }

    if (btnToggle) {
      btnToggle.addEventListener("click", function () {
        markInteracted();
        if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.toggleMusic();
      });
    }

    if (btnTrack) {
      btnTrack.addEventListener("click", function () {
        markInteracted();
        if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.openNowPlaying();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", function () {
        markInteracted();
        if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.nextTrack();
      });
    }

    if (pill) {
      pill.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(".remote-key")) return;
        markInteracted();
        if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.openNowPlaying();
      });
    }

    function applyPlayback(d) {
      var playing = !!d.isPlaying;
      var loaded = !!d.hasLoadedItem;
      document.documentElement.setAttribute("data-playing", playing ? "true" : "false");
      if (pill) {
        pill.setAttribute("data-playing", playing ? "true" : "false");
        pill.setAttribute("data-loaded", loaded ? "true" : "false");
      }
      if (btnToggle) {
        btnToggle.setAttribute("aria-label", playing ? "Pause music" : "Play music");
        btnToggle.setAttribute("aria-pressed", playing ? "true" : "false");
      }
      if (btnNext) {
        btnNext.hidden = !(loaded && d.queueLength > 1);
      }
      if (d.track && titleEl && artistEl) {
        if (playing) {
          titleEl.textContent = d.track.name || "Playing";
        } else {
          titleEl.textContent = "Paused";
        }
        artistEl.textContent = d.track.artistName || d.track.name || "";
      } else if (titleEl && artistEl) {
        titleEl.textContent = "Sound Off";
        artistEl.textContent = "Gypsy";
      }
    }

    window.addEventListener("ipod:playback", function (e) {
      applyPlayback(e.detail || {});
    });
    applyPlayback({ isPlaying: false, hasLoadedItem: false, isLoading: false, queueLength: 0, track: null });

    document.addEventListener("keydown", function (e) {
      var host = document.getElementById("ipod");
      if (!host || !host.shadowRoot) return;

      var active = document.activeElement;
      var inHud = active && active !== document.body && active !== host && active.closest && active.closest(".studio-hud");
      if (inHud && (e.key === " " || e.key === "Enter")) {
        return;
      }

      if (host.shadowRoot.activeElement && host.shadowRoot.activeElement.classList.contains("menu-items")) {
        markInteracted();
        return;
      }

      var menu = host.shadowRoot.querySelector(".menu-items");
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape" || e.key === "Backspace") {
        markInteracted();
        if (e.key === "Backspace") {
          e.preventDefault();
          if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.back();
          return;
        }
        if (menu) {
          menu.focus({ preventScroll: true });
          menu.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true, cancelable: true }));
          if (e.key === "Escape") {
            menu.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }));
          }
          e.preventDefault();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        markInteracted();
        if (window.__IPOD_BRIDGE) window.__IPOD_BRIDGE.toggleMusic();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHud, { once: true });
  else initHud();
})();
