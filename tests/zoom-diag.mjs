// Why does the device appear to zoom on load?
// Samples the host width and the component's internal --ipod-scale over time.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.LIVE_URL || "http://127.0.0.1:8099/";
const PORT = 9361;

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "zoom-"))}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--window-size=1400,900",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("chrome never came up");
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id));
};
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

const { result: t } = await send("Target.createTarget", { url: "about:blank" });
const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
const S = a.sessionId;
await send("Runtime.enable", {}, S);
await send("Page.enable", {}, S);

const probe = `(() => {
  const ip = document.querySelector('web-music-ipod');
  if (!ip) return null;
  const host = ip.getBoundingClientRect();
  const sr = ip.shadowRoot;
  const inner = sr && sr.querySelector('.ipod-shadow-inner');
  const container = sr && sr.querySelector('.ipod-container');
  const cs = inner ? getComputedStyle(inner) : null;
  const cr = container ? container.getBoundingClientRect() : null;
  return {
    hostW: Math.round(host.width),
    hostScale: getComputedStyle(ip).scale,
    innerScale: cs ? cs.getPropertyValue('--ipod-scale').trim() : null,
    innerTransition: cs ? cs.transition : null,
    renderedW: cr ? Math.round(cr.width) : null,
    renderedH: cr ? Math.round(cr.height) : null,
  };
})()`;

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, S);
  return r.result?.result?.value;
};

await send("Page.navigate", { url: URL_ }, S);

console.log(`\nzoom-diag: ${URL_}  window 1400x900\n`);
for (let i = 0; i < 14; i++) {
  const v = await ev(probe);
  console.log(`${String(i * 150).padStart(4)}ms`, JSON.stringify(v));
  if (i === 6) {
    const script = `(() => {
      const ip = document.querySelector('web-music-ipod');
      const sr = ip.shadowRoot;
      const sel = sr.querySelector('[aria-selected="true"]');
      const rows = [...sr.querySelectorAll('[role="option"], li')].map(n => n.textContent.trim()).filter(Boolean);
      const screen = sr.querySelector('.ipod-screen');
      const menu = sr.querySelector('.menu-layer');
      const one = rows.length ? sr.querySelector('[role="option"], li').getBoundingClientRect() : null;
      const sr2 = screen ? screen.getBoundingClientRect() : null;
      return {
        rows, selected: sel && sel.textContent.trim(),
        screenH: sr2 ? Math.round(sr2.height) : null,
        rowH: one ? Math.round(one.height) : null,
        fits: one && sr2 ? Math.floor(sr2.height / one.height) : null,
        menuH: menu ? Math.round(menu.getBoundingClientRect().height) : null,
      };
    })()`;
    console.log("\nscreen-fit:", JSON.stringify(await ev(script), null, 0), "\n");
  }
  await sleep(150);
}

chrome.kill();
ws.close();
