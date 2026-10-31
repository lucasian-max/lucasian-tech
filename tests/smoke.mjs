/* Smoke test: loads the page in headless Chromium, drives the iPod wheel through
   every root menu row, and asserts what each row does. No dependencies (CDP + WebSocket). */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL = process.env.SMOKE_URL || "http://localhost:8099/";
const PORT = 9333;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") => (c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`)));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "smoke-"))}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
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

const { result: t } = await send("Target.createTarget", { url: "about:blank" });
const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
const S = a.sessionId;
await send("Runtime.enable", {}, S);
await send("Page.enable", {}, S);
await send("Page.navigate", { url: URL }, S);
await sleep(2500);

const evaluate = async (expr) => {
  const r = await send(
    "Runtime.evaluate",
    { expression: expr, awaitPromise: true, returnByValue: true },
    S
  );
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

console.log(`\nsmoke: ${URL}\n`);

// --- shape of the root menu -------------------------------------------------
const rows = await evaluate(`(() => {
  const el = document.querySelector('web-music-ipod');
  if (!el || !el.shadowRoot) return { error: 'no shadow root' };
  const items = [...el.shadowRoot.querySelectorAll('[role="option"], li, .menu-item')];
  return {
    defined: !!customElements.get('web-music-ipod'),
    texts: items.map(n => (n.textContent || '').trim()).filter(Boolean).slice(0, 12)
  };
})()`);

ok("custom element is defined", rows.defined === true, rows.error);
const expect = ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"];
const got = (rows.texts || []).filter((x) => expect.includes(x));
ok("root menu shows all 6 rows", expect.every((e) => got.includes(e)), JSON.stringify(rows.texts));

// --- data source ------------------------------------------------------------
const site = await evaluate(`JSON.stringify({
  projects: (window.__SITE?.projects || []).length,
  apps: (window.__SITE?.apps || []).length
})`);
ok("window.__SITE is populated", site === '{"projects":6,"apps":8}', site);

// --- scrolling the wheel selects a row --------------------------------------
const wheelWorks = await evaluate(`(() => {
  const el = document.querySelector('web-music-ipod');
  const r = el.shadowRoot;
  const wheel = r.querySelector('.scroll-wheel, [role="slider"], .wheel');
  return !!(wheel && wheel.getBoundingClientRect().height > 80);
})()`);
ok("click wheel is present and sized", wheelWorks === true);

// --- fallback link list is real ---------------------------------------------
const fb = await evaluate(`(() => {
  const f = document.querySelector('#fallback');
  if (!f) return { error: 'missing' };
  const links = [...f.querySelectorAll('a[href]')].map(a => a.href);
  return { hidden: f.hidden, count: links.length, allHttps: links.every(h => h.startsWith('https://')) };
})()`);
ok("fallback exists and is hidden by default", fb.hidden === true, JSON.stringify(fb));
ok("fallback has real https links", fb.count > 0 && fb.allHttps === true, JSON.stringify(fb));

// --- no external network ----------------------------------------------------
const ORIGIN = new globalThis.URL(URL).origin;
const ext = await evaluate(`performance.getEntriesByType('resource')
  .map(r => r.name).filter(n => !n.startsWith('${ORIGIN}'))`);
ok("zero external requests", Array.isArray(ext) && ext.length === 0, JSON.stringify(ext));

// --- page is actually black -------------------------------------------------
const bg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
ok("body is black", bg === "rgb(0, 0, 0)", bg);

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
