/* Zoom check: the host element must be 440px wide so the component's own
   `@container ipod (width < 360px)` rule leaves --ipod-scale at 1. At width 0
   it self-scales to 0.75, which reads as the device "zooming in" after load.
   No dependencies — CDP over WebSocket, same as smoke.mjs. */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL = process.env.ZOOM_URL || "http://localhost:8099/";
const PORT = 9337;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
  { name: "small", width: 360, height: 800 },
];

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") => (c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`)));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "zoom-"))}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(150);
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
  if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
};
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

const { result: tgt } = await send("Target.createTarget", { url: "about:blank" });
const { result: att } = await send("Target.attachToTarget", { targetId: tgt.targetId, flatten: true });
const S = att.sessionId;
await send("Runtime.enable", {}, S);
await send("Page.enable", {}, S);

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

console.log(`\nzoom: ${URL}\n`);

for (const vp of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.width < 700,
  }, S);
  await send("Page.navigate", { url: URL }, S);
  await sleep(2600);

  const m = await evaluate(`(() => {
    const host = document.querySelector('web-music-ipod');
    if (!host || !host.shadowRoot) return { error: 'no shadow root' };
    const inner = host.shadowRoot.querySelector('.ipod-shadow-inner');
    const dev = host.shadowRoot.querySelector('.ipod-container');
    const box = host.getBoundingClientRect();
    const d = dev && dev.getBoundingClientRect();
    return {
      hostW: Math.round(host.offsetWidth),
      visualW: Math.round(box.width),
      scale: inner ? (getComputedStyle(inner).getPropertyValue('--ipod-scale').trim() || 'unset') : 'no-inner',
      devW: d ? Math.round(d.width) : null,
      devH: d ? Math.round(d.height) : null,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  })()`);

  if (m.error) {
    fail++;
    console.log(`  FAIL ${vp.name} — ${m.error}`);
    continue;
  }

  ok(`${vp.name.padEnd(7)} host is 440px wide`, m.hostW === 440, `got ${m.hostW}`);
  ok(`${vp.name.padEnd(7)} component scale is 1 (no self-shrink)`, m.scale === "1", `got ${m.scale}`);
}

ws.close();
chrome.kill();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
