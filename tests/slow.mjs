import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.SLOW_URL || "http://127.0.0.1:8100/probe-slow.html";
const PORT = 9337;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "sl-"))}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
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
await send("Page.navigate", { url: URL_ }, S);

const read = async () => {
  const r = await send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const s = document.getElementById('stage');
        const f = document.getElementById('fallback');
        return {
          stageDisplay: s ? getComputedStyle(s).display : null,
          fallbackDisplay: f ? getComputedStyle(f).display : null,
          state: document.documentElement.getAttribute('data-ipod'),
        };
      })()`,
      returnByValue: true,
    },
    S
  );
  return r.result?.result?.value;
};

console.log(`\nslow: ${URL_}\n`);

await sleep(3000);
const at3 = await read();
ok("t=3s (module still downloading) shows the device", at3.stageDisplay === "grid" && at3.fallbackDisplay === "none", JSON.stringify(at3));

await sleep(4000);
const at7 = await read();
ok("t=7s (past the old 6s timer) still shows the device", at7.stageDisplay === "grid" && at7.fallbackDisplay === "none", JSON.stringify(at7));

await sleep(4000);
const at11 = await read();
ok(
  "t=11s (module arrived) shows the device",
  at11.stageDisplay === "grid" && at11.fallbackDisplay === "none" && at11.state === "ok",
  JSON.stringify(at11)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
