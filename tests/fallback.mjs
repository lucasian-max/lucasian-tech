/* Fallback test: blocks the iPod module and asserts the plain-link list appears.
   Run: node tests/fallback.mjs   (needs a static server on 8099) */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.SMOKE_URL || "http://localhost:8099/";
const PORT = 9336;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "fb-"))}`,
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
await send("Network.enable", {}, S);
await send("Page.enable", {}, S);

// Kill the component module before anything else loads.
await send("Network.setBlockedURLs", { urls: ["*web-music-ipod.esm.js*"] }, S);
await send("Page.navigate", { url: URL_ }, S);
await sleep(1200);

const read = async () => {
  const r = await send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const s = document.getElementById('stage');
        const f = document.getElementById('fallback');
        const cs = s && getComputedStyle(s);
        const cf = f && getComputedStyle(f);
        const first = f && f.querySelector('a');
        return {
          stageDisplay: cs ? cs.display : null,
          fallbackDisplay: cf ? cf.display : null,
          stageRect: s ? Math.round(s.getBoundingClientRect().height) : null,
          links: f ? f.querySelectorAll('a').length : 0,
          firstHref: first ? first.href : null,
          bodyScroll: getComputedStyle(document.body).overflow,
        };
      })()`,
      returnByValue: true,
    },
    S
  );
  return r.result?.result?.value;
};

console.log(`\nfallback: ${URL_}\n`);

const early = await read();
ok("stage takes no space while the module is blocked", early.stageRect === 0 || early.stageDisplay === "none", JSON.stringify(early));

await sleep(5200); // let the 6s timer from page start elapse
const late = await read();
ok("stage is hidden after the timeout", late.stageDisplay === "none", JSON.stringify(late));
ok("fallback is visible", late.fallbackDisplay !== "none", JSON.stringify(late));
ok("fallback has 10 links", late.links === 10, String(late.links));
ok("fallback links are https", /^https:\/\//.test(late.firstHref || ""), late.firstHref);
ok("fallback sits at the top of the page", late.stageRect === 0, String(late.stageRect));

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
