import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const CDP_PORT = 9357;
const HTTP_PORT = 8147;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
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
    `--user-data-dir=${mkdtempSync("/tmp/mobile-chr-")}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=390,844",
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
    consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, S);

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

async function waitFor(expr, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evalJs(expr)) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

const PAGE_URL = process.env.MOBILE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
console.log(`\nmobile: ${PAGE_URL}  root ${ROOT}\n`);

await send("Page.navigate", { url: PAGE_URL }, S);
const ready = await waitFor(`!!window.__IPOD_BRIDGE && !!document.getElementById('ipod')?.shadowRoot`, 15000);
if (!ready) throw new Error("site did not become ready");
await sleep(400);

const layout = await evalJs(`(() => {
  const set = document.getElementById('ipod-set');
  const setRect = set.getBoundingClientRect();
  const pill = document.getElementById('music-pill').getBoundingClientRect();
  const hint = document.getElementById('studio-hint');
  const rig = document.getElementById('chassis-rig');
  const host = document.getElementById('ipod');
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scale: parseFloat(getComputedStyle(set).getPropertyValue('--set-scale')),
    set: { left: setRect.left, right: setRect.right, top: setRect.top, bottom: setRect.bottom },
    pill: { left: pill.left, right: pill.right, top: pill.top, bottom: pill.bottom },
    hint: hint ? hint.textContent.trim() : '',
    hintRect: hint ? { top: hint.getBoundingClientRect().top, bottom: hint.getBoundingClientRect().bottom } : null,
    tilt: getComputedStyle(rig).transform,
    filter: getComputedStyle(host).filter,
  };
})()`);

const perf = await evalJs(`(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const resources = performance.getEntriesByType('resource');
  const bytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
  const blocking = [...document.querySelectorAll('script[src]')].filter(s => !s.defer && !s.type.includes('module')).length;
  return { dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), bytes, resources: resources.length, blocking };
})()`);
console.log(`  info first load ${JSON.stringify(perf)}`);
ok("no blocking scripts in the shell", perf.blocking === 0, String(perf.blocking));
ok("first load is under 600 KB", perf.bytes > 0 && perf.bytes < 600000, String(perf.bytes));
ok("page is interactive under 2s", perf.dcl > 0 && perf.dcl < 2000, String(perf.dcl));

const rootItems = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  return [...r.querySelectorAll('.menu-item .item-title')].map(n => n.textContent.trim());
})()`);
ok("menu loads from the deferred shell", JSON.stringify(rootItems) === JSON.stringify(["Music", "Projects", "About", "Contacts"]), JSON.stringify(rootItems));

ok("no sideways scroll on phone", layout.scrollWidth <= layout.vw + 1, JSON.stringify(layout));
ok("iPod uses most of the phone width", layout.set.right - layout.set.left >= 360, JSON.stringify(layout.set));
ok(
  "iPod stays inside the screen",
  layout.set.left >= 0 && layout.set.right <= layout.vw + 1 && layout.set.top >= 0 && layout.set.bottom <= layout.vh + 1,
  JSON.stringify(layout.set)
);
ok("scale is at least 0.84", layout.scale >= 0.84, String(layout.scale));
ok(
  "remote fits on a phone",
  layout.pill.left >= 0 && layout.pill.right <= layout.vw + 1 && layout.pill.top >= 0 && layout.pill.bottom <= layout.vh,
  JSON.stringify(layout.pill)
);
ok("hint says tap on touch", /tap/i.test(layout.hint), layout.hint);
ok("no 3D tilt on phone", layout.tilt === "none", layout.tilt);
ok("no drop shadow on phone", layout.filter === "none", layout.filter);
ok(
  "remote does not overlap the iPod",
  !(layout.set.left < layout.pill.right && layout.set.right > layout.pill.left && layout.set.top < layout.pill.bottom && layout.set.bottom > layout.pill.top),
  JSON.stringify({ set: layout.set, pill: layout.pill })
);
ok(
  "hint sits below the iPod",
  layout.hintRect && layout.hintRect.top > layout.set.bottom,
  JSON.stringify({ setBottom: layout.set.bottom, hintTop: layout.hintRect && layout.hintRect.top })
);

if (process.env.MOBILE_INTERACTIONS === "1") {
await evalJs(`window.__IPOD_BRIDGE.openScreen('projects')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'projects'`, 4000);
await sleep(250);
const rowPoint = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const rows = r.querySelectorAll('.menu-items');
  const row = rows[rows.length - 1].querySelector('.menu-item');
  const b = row.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rowPoint.x, y: rowPoint.y }] }, S);
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, S);
const tapped = await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'project-detail'`, 5000);
const detail = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  return r.querySelector('.screen-title')?.textContent.trim();
})()`);
ok("one tap opens a project", tapped && detail === "Black Hole", JSON.stringify({ tapped, detail }));

await evalJs(`window.__IPOD_BRIDGE.openScreen('songs')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'songs'`, 4000);
await sleep(250);
const listPoint = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const list = lists[lists.length - 1];
  const b = list.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, before: list.scrollTop };
})()`);
await send(
  "Input.synthesizeScrollGesture",
  { x: listPoint.x, y: listPoint.y, xDistance: 0, yDistance: -90, speed: 800, gestureSourceType: "touch" },
  S
);
await sleep(400);
const scrolled = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  return lists[lists.length - 1].scrollTop;
})()`);
ok("song list scrolls with a finger", scrolled > listPoint.before, JSON.stringify({ before: listPoint.before, after: scrolled }));

}

ok(
  "no console or page errors",
  consoleErrors.length === 0 && pageErrors.length === 0,
  JSON.stringify({ consoleErrors: consoleErrors.slice(0, 3), pageErrors: pageErrors.slice(0, 3) })
);

console.log(`\n${pass} passed, ${fail} failed\n`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
