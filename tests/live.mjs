// Live-site check: does lucasian.tech render the 6-row iPod menu end to end?
// Run: node tests/live.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.LIVE_URL || "https://lucasian.tech/";
const PORT = 9341;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "live-"))}`,
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
const errors = [];
await send("Log.enable", {}, S);
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
});
await send("Page.navigate", { url: URL_ }, S);

const read = async () => {
  const r = await send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const ip = document.querySelector('web-music-ipod');
        const sr = ip && ip.shadowRoot;
        const rows = sr ? [...sr.querySelectorAll('[role="option"],li')].map(x => x.textContent.trim()).filter(Boolean) : [];
        const screen = sr && sr.querySelector('[class*=screen]') || (sr && sr.querySelector('canvas')) || null;
        const srect = screen ? screen.getBoundingClientRect() : null;
        const host = ip ? ip.getBoundingClientRect() : null;
        return {
          state: document.documentElement.dataset.ipod || null,
          stage: document.getElementById('stage') ? getComputedStyle(document.getElementById('stage')).display : null,
          fallback: document.getElementById('fallback') ? getComputedStyle(document.getElementById('fallback')).display : null,
          defined: !!customElements.get('web-music-ipod'),
          shadows: !!(sr),
          rows,
          screen: srect ? [Math.round(srect.width), Math.round(srect.height)] : null,
          host: host ? [Math.round(host.width), Math.round(host.height)] : null,
        };
      })()`,
      returnByValue: true,
    },
    S
  );
  return r.result?.result?.value;
};

console.log(`\nlive: ${URL_}\n`);

let last;
for (let i = 0; i < 30; i++) {
  last = await read();
  if (last && last.rows && last.rows.length === 6) break;
  await sleep(1000);
}

console.log(JSON.stringify(last, null, 2), "\n");

const want = ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"];
ok("device element is defined", last?.defined === true, JSON.stringify(last?.defined));
ok("device has a shadow root", last?.shadows === true, JSON.stringify(last?.shadows));
ok("stage is visible", last?.stage === "grid", String(last?.stage));
ok("fallback is hidden", last?.fallback === "none", String(last?.fallback));
ok("state attribute is ok", last?.state === "ok", String(last?.state));
ok("root menu has exactly 6 rows", last?.rows?.length === 6, `got ${last?.rows?.length}: ${JSON.stringify(last?.rows)}`);
ok("rows are the expected labels", JSON.stringify(last?.rows) === JSON.stringify(want), JSON.stringify(last?.rows));
ok("screen has a real size", last?.screen && last.screen[0] > 100 && last.screen[1] > 80, JSON.stringify(last?.screen));
ok("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

const shot = await send("Page.captureScreenshot", { format: "png" }, S);
if (shot.result?.data) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/live-shot.png", Buffer.from(shot.result.data, "base64"));
  console.log("\nscreenshot: /tmp/live-shot.png");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
