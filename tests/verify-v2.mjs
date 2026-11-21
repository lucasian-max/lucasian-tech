/* End-to-end verification + visual capture for lucasian.tech v2.
   Zero dependencies: Node built-in http + Chromium CDP over WebSocket. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOT_DIR = process.env.SHOT_DIR || join(ROOT, "tests", "shots");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const CDP_PORT = 9344;
const HTTP_PORT = 8111;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer((req, res) => {
  const cleanPath = (req.url || "/").split("?")[0];
  let filePath = join(ROOT, cleanPath === "/" ? "index.html" : cleanPath);
  try {
    const st = statSync(filePath);
    if (st.isDirectory()) filePath = join(filePath, "index.html");
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Content-Length": body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
};

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${mkdtempSync("/tmp/v2-chr-")}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    "about:blank",
  ],
  { env: { ...process.env, TMPDIR: "/tmp" } }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("Chromium CDP did not start");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(m.params?.exceptionDetails?.text || "exception");
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    consoleErrors.push(txt);
  }
};

const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { result: tgt } = await send("Target.createTarget", { url: "about:blank" });
const { result: att } = await send("Target.attachToTarget", { targetId: tgt.targetId, flatten: true });
const S = att.sessionId;

await send("Runtime.enable", {}, S);
await send("Page.enable", {}, S);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, S);
await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/` }, S);
await sleep(1200);

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

async function shot(filename) {
  const r = await send("Page.captureScreenshot", { format: "png" }, S);
  writeFileSync(join(SHOT_DIR, filename), Buffer.from(r.result.data, "base64"));
}

console.log("\nverify-v2: http://127.0.0.1:" + HTTP_PORT + "/\n");

// 1. SEO static endpoints
const robotsRes = await fetch(`http://127.0.0.1:${HTTP_PORT}/robots.txt`);
const robotsTxt = await robotsRes.text();
ok("robots.txt served cleanly (not HTML)", robotsRes.ok && /Sitemap:\s*https:\/\/lucasian\.tech\/sitemap\.xml/.test(robotsTxt));

const smRes = await fetch(`http://127.0.0.1:${HTTP_PORT}/sitemap.xml`);
const smTxt = await smRes.text();
ok("sitemap.xml served cleanly", smRes.ok && smTxt.includes("<loc>https://lucasian.tech/</loc>"));

// 2. Root menu shape + zero self-hosted leaks
const rootState = await evalJs(`(() => {
  const el = document.getElementById('ipod');
  const r = el && el.shadowRoot;
  if (!r) return { error: 'no shadowRoot' };
  const items = [...r.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim());
  const title = r.querySelector('.screen-title')?.textContent?.trim();
  const html = document.documentElement.outerHTML;
  const leak = /self-hosted|audiobooks\.lucasian|karakeep\.lucasian|library\.lucasian|manga\.lucasian|books\.lucasian|usage\.lucasian|navidrome|music\.lucasian/i.test(html);
  const wearInsideRig = !!document.querySelector('#chassis-rig .wear-tint') && !document.querySelector('#ipod-set > .wear-tint');
  return { title, items, leak, wearInsideRig, hasBridge: !!window.__IPOD_BRIDGE };
})()`);

ok("iPod title is Mridul Vijay", rootState.title === "Mridul Vijay", JSON.stringify(rootState));
ok("root menu has 4 clean rows (Music, Projects, About, Contacts)", JSON.stringify(rootState.items) === JSON.stringify(["Music", "Projects", "About", "Contacts"]), JSON.stringify(rootState.items));
ok("zero self-hosted subdomains or leaks in HTML", rootState.leak === false);
ok("wear overlays mounted inside coupled #chassis-rig", rootState.wearInsideRig === true);

await shot("v2-desktop-home.png");

// 3. Direct click on LCD row (Projects -> click once selects, click again opens -> click project opens detail)
await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const rows = [...r.querySelectorAll('.menu-item')];
  rows[1].click();
})()`);
await sleep(120);
const afterFirstClick = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  return r.querySelector('.menu-item.selected .item-title')?.textContent?.trim();
})()`);
ok("direct LCD click selects clicked row (Projects)", afterFirstClick === "Projects", afterFirstClick);

await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  r.querySelector('.menu-item.selected').click();
})()`);
await sleep(420);
const projectsScreen = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const active = lists[lists.length - 1];
  return {
    title: r.querySelector('.screen-title')?.textContent?.trim(),
    items: [...active.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim()),
    hash: location.hash
  };
})()`);
ok("clicking selected row opens Projects screen + syncs hash", projectsScreen.title === "Projects" && projectsScreen.items.includes("handwritten2pdf") && projectsScreen.hash === "#projects", JSON.stringify(projectsScreen));

// Open Black Hole detail card
await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const active = lists[lists.length - 1];
  active.querySelector('.menu-item.selected').click();
})()`);
await sleep(420);
const detailScreen = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const active = lists[lists.length - 1];
  return {
    title: r.querySelector('.screen-title')?.textContent?.trim(),
    items: [...active.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim()),
    selectedTitle: active.querySelector('.menu-item.selected .item-title')?.textContent?.trim(),
    hash: location.hash
  };
})()`);
ok("project detail card shows facts + selects first link row", detailScreen.title === "Black Hole" && detailScreen.selectedTitle === "Launch demo" && detailScreen.hash === "#projects/black-hole", JSON.stringify(detailScreen));

await shot("v2-desktop-projects.png");

// Verify Music hub contains Navidrome-synced playlists
await evalJs(`window.__IPOD_BRIDGE.openScreen('playlists')`);
await sleep(360);
const playlistsScreen = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const active = lists[lists.length - 1];
  return [...active.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim());
})()`);
ok("Music playlists include Studio Ambient, On Repeat, and Heavy Rotation", playlistsScreen.includes("Studio Ambient") && playlistsScreen.includes("On Repeat") && playlistsScreen.includes("Heavy Rotation"), JSON.stringify(playlistsScreen));

// 4. Omarchy-style music pill plays real audio & opens Now Playing
await evalJs(`document.getElementById('music-toggle').click()`);
await sleep(600);
const playingState = await evalJs(`(() => {
  const pill = document.getElementById('music-pill');
  const title = document.getElementById('music-title')?.textContent?.trim();
  const artist = document.getElementById('music-artist')?.textContent?.trim();
  const pb = window.__IPOD_BRIDGE?.getPlayback();
  return {
    pillPlaying: pill?.getAttribute('data-playing'),
    htmlPlaying: document.documentElement.getAttribute('data-playing'),
    title,
    artist,
    hasLoadedItem: pb?.hasLoadedItem,
    isPlaying: pb?.isPlaying,
    queueLen: pb?.queue?.length || 0
  };
})()`);
ok("Omarchy music pill starts playback & updates HUD", playingState.pillPlaying === "true" && playingState.title === "Midnight Desk" && playingState.queueLen > 0, JSON.stringify(playingState));

await evalJs(`document.getElementById('music-track').click()`);
await sleep(300);
const npScreen = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  return {
    title: r.querySelector('.screen-title')?.textContent?.trim(),
    songTitle: r.querySelector('[data-testid="now-playing-title"], .title')?.textContent?.trim()
  };
})()`);
ok("clicking music pill track opens Now Playing screen on iPod", npScreen.title === "Now Playing", JSON.stringify(npScreen));

await shot("v2-desktop-playing.png");

// Pause audio for clean remaining checks
await evalJs(`document.getElementById('music-toggle').click()`);
await sleep(150);

// 5. Top-right Notes drawer
await evalJs(`document.getElementById('notes-toggle').click()`);
await sleep(300);
const notesListOk = await evalJs(`(() => {
  const sheet = document.getElementById('notes-sheet');
  const items = [...sheet.querySelectorAll('.note-item-title')].map(n => n.textContent.trim());
  return { open: !sheet.hidden && sheet.classList.contains('is-open'), items };
})()`);
ok("top-right Notes drawer opens with posts", notesListOk.open && notesListOk.items.length >= 2, JSON.stringify(notesListOk));

await evalJs(`document.querySelector('.note-item').click()`);
await sleep(200);
await shot("v2-desktop-notes.png");

// Close Notes via Escape
await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
await sleep(300);
const notesClosed = await evalJs(`document.getElementById('notes-sheet').hidden === true`);
ok("Escape closes Notes drawer", notesClosed);

// 6. Return to home via brand button + verify global keyboard nav
await evalJs(`document.getElementById('brand-home').click()`);
await sleep(200);
const homeAfterBrand = await evalJs(`document.getElementById('ipod').shadowRoot.querySelector('.screen-title')?.textContent?.trim()`);
ok("brand button returns iPod to root menu", homeAfterBrand === "Mridul Vijay", homeAfterBrand);

// 7. Mobile viewport screenshot (390x844)
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
const mobileBounds = await evalJs(`(() => {
  const hud = document.querySelector('.studio-hud').getBoundingClientRect();
  const rig = document.getElementById('chassis-rig').getBoundingClientRect();
  return {
    hudBottom: Math.round(hud.bottom),
    rigTop: Math.round(rig.top),
    rigLeft: Math.round(rig.left),
    rigRight: Math.round(rig.right),
    vw: window.innerWidth
  };
})()`);
ok("mobile layout fits cleanly without horizontal overflow", mobileBounds.rigLeft >= 0 && mobileBounds.rigRight <= mobileBounds.vw + 2, JSON.stringify(mobileBounds));
await shot("v2-mobile-home.png");

ok("zero console or page errors", consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors, pageErrors }));

console.log(`\n${pass} passed, ${fail} failed\n`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
