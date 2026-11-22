import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOT_DIR = process.env.SHOT_DIR || join(ROOT, "tests", "shots");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const CDP_PORT = 9345;
const HTTP_PORT = 8112;

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
    console.log(`  FAIL ${name}${detail ? " - " + detail : ""}`);
  }
};

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${mkdtempSync("/tmp/v3-chr-")}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
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
  if (process.env.SKIP_SHOTS === "1") return;
  const r = await Promise.race([
    send("Page.captureScreenshot", { format: "png" }, S),
    sleep(5000).then(() => ({ timeout: true })),
  ]);
  if (r.timeout) {
    console.log(`  ..   screenshot skipped: ${filename}`);
    return;
  }
  writeFileSync(join(SHOT_DIR, filename), Buffer.from(r.result.data, "base64"));
}

console.log("\nverify: http://127.0.0.1:" + HTTP_PORT + "/\n");

const rootState = await evalJs(`(() => {
  const el = document.getElementById('ipod');
  const r = el && el.shadowRoot;
  if (!r) return { error: 'no shadowRoot' };
  const items = [...r.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim());
  const title = r.querySelector('.screen-title')?.textContent?.trim();
  const hasNotes = !!document.getElementById('notes-toggle') || !!document.getElementById('notes-sheet');
  const hasBrand = !!document.getElementById('brand-home');
  const pillTitle = document.getElementById('music-title')?.textContent?.trim();
  const backlit = el.getAttribute('backlit');
  const html = document.documentElement.outerHTML;
  const leak = /self-hosted|audiobooks\.lucasian|karakeep\.lucasian|studio-ambient/i.test(html);
  return { title, items, hasNotes, hasBrand, pillTitle, backlit, leak };
})()`);

ok("title says Mridul Vijay", rootState.title === "Mridul Vijay", JSON.stringify(rootState));
ok("menu is Music, Projects, About, Contacts", JSON.stringify(rootState.items) === JSON.stringify(["Music", "Projects", "About", "Contacts"]), JSON.stringify(rootState.items));
ok("no Notes row or brand badge", !rootState.hasNotes && !rootState.hasBrand, JSON.stringify(rootState));
ok("remote starts on Sound Off", rootState.pillTitle === "Sound Off", rootState.pillTitle);
ok("backlit is on and no old service names leak", rootState.backlit === "true" && !rootState.leak, JSON.stringify(rootState));

await shot("v3-desktop-home.png");

await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  r.querySelector('.menu-item.selected').click();
})()`);
await sleep(420);

const musicScreen = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const active = lists[lists.length - 1];
  return {
    title: r.querySelector('.screen-title')?.textContent?.trim(),
    items: [...active.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim()),
    hash: location.hash
  };
})()`);
ok("Music opens the song list", musicScreen.title === "Music" && musicScreen.items[0] === "Gypsy" && musicScreen.items.length === 8, JSON.stringify(musicScreen));

await shot("v3-desktop-songs.png");

await evalJs(`document.getElementById('music-toggle').click()`);
await sleep(900);
const playingState = await evalJs(`(() => {
  const pill = document.getElementById('music-pill');
  const title = document.getElementById('music-title')?.textContent?.trim();
  const artist = document.getElementById('music-artist')?.textContent?.trim();
  const pb = window.__IPOD_BRIDGE?.getPlayback();
  return {
    pillPlaying: pill?.getAttribute('data-playing'),
    title,
    artist,
    duration: Math.round(pb?.currentPlaybackDuration || 0),
    queueLen: pb?.queue?.length || 0
  };
})()`);
ok("remote plays all of Gypsy, over 3 minutes", playingState.pillPlaying === "true" && playingState.title === "Gypsy" && playingState.artist === "Fleetwood Mac" && playingState.duration > 180, JSON.stringify(playingState));

await evalJs(`document.getElementById('music-track').click()`);
await sleep(360);
await shot("v3-desktop-playing.png");

await evalJs(`window.__IPOD_BRIDGE.openScreen('main')`);
await sleep(300);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
const mobileBounds = await evalJs(`(() => {
  const rig = document.getElementById('chassis-rig').getBoundingClientRect();
  return { left: Math.round(rig.left), right: Math.round(rig.right), vw: window.innerWidth };
})()`);
ok("phone layout fits without sideways scroll", mobileBounds.left >= 0 && mobileBounds.right <= mobileBounds.vw + 2, JSON.stringify(mobileBounds));
await shot("v3-mobile-home.png");

ok("no console or page errors", consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors, pageErrors }));

console.log(`\n${pass} passed, ${fail} failed\n`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
