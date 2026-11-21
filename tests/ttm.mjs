import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.LIVE_URL || "https://lucasian.tech/";
const PORT = 9349;
const RUNS = Number(process.env.RUNS || 3);

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "ttm-"))}`,
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

const times = [];
for (let run = 1; run <= RUNS; run++) {
  await send("Page.navigate", { url: "about:blank" }, S);
  await sleep(300);
  await send("Page.navigate", { url: `${URL_}?ttm=${run}${Date.now()}` }, S);

  let ttm = null;
  for (let i = 0; i < 120; i++) {
    const r = await send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const ip = document.querySelector('web-music-ipod');
          const sr = ip && ip.shadowRoot;
          if (!sr) return 0;
          const rows = [...sr.querySelectorAll('[role="option"],li')].map(x => x.textContent.trim()).filter(Boolean);
          const ls = sr.querySelector('.loading-screen');
          const gone = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
          return gone && rows.length === 6 ? Math.round(performance.now()) : 0;
        })()`,
        returnByValue: true,
      },
      S
    );
    const v = r.result?.result?.value;
    if (v) {
      ttm = v;
      break;
    }
    await sleep(100);
  }
  times.push(ttm);
  console.log(`run ${run}: ${ttm === null ? "never reached the menu" : ttm + "ms"}`);
}

const ok = times.filter(Boolean);
console.log(
  `\ntime-to-menu: ${ok.length}/${RUNS} succeeded, median ${ok.sort((a, b) => a - b)[Math.floor(ok.length / 2)]}ms`
);
chrome.kill();
ws.close();
process.exit(ok.length === RUNS ? 0 : 1);
