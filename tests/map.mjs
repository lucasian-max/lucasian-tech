import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.SMOKE_URL || "http://localhost:8099/";
const PORT = 9335;

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "map-"))}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--window-size=1440,900",
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
const navigations = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Page.frameRequestedNavigation") navigations.push(m.params.url);
  if (m.method === "Page.frameNavigated" && m.params.frame.parentId === undefined)
    navigations.push(m.params.frame.url);
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id));
};
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

const open = async () => {
  const { result: t } = await send("Target.createTarget", { url: "about:blank" });
  const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
  const S = a.sessionId;
  await send("Runtime.enable", {}, S);
  await send("Page.enable", {}, S);
  await send("Page.navigate", { url: URL_ }, S);
  await sleep(2800);
  return S;
};

let S = await open();

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const key = async (k, code, kc) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await sleep(140);
};

const focusWheel = () =>
  evaluate(`(() => {
    const r = document.querySelector('web-music-ipod').shadowRoot;
    const w = r.querySelector('.scroll-wheel, [role="slider"], .wheel') || r.host;
    w.focus && w.focus();
    return true;
  })()`);

const state = () =>
  evaluate(`(() => {
    const r = document.querySelector('web-music-ipod').shadowRoot;
    const t = r.querySelector('.menu-title');
    const s = r.querySelector('[aria-selected="true"]');
    return {
      title: t ? t.textContent.trim() : null,
      selected: s ? s.textContent.trim() : null,
      rows: [...r.querySelectorAll('[role="option"], li')].map(n => n.textContent.trim().replace(/\\s+/g,' ')).filter(Boolean)
    };
  })()`);

const NAMES = ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"];
const out = [];

await focusWheel();
const root = await state();
out.push({ row: "iPod (root)", opens: "menu", shows: root.rows.join(" | ") });

for (let i = 0; i < NAMES.length; i++) {
  if (i > 0) {
    S = await open();
    await focusWheel();
  }
  for (let k = 0; k < i; k++) await key("ArrowDown", "ArrowDown", 40);
  const cur = await state();
  navigations.length = 0;
  await key("Enter", "Enter", 13);
  await sleep(1200);
  const after = await state().catch(() => ({ title: "(navigated away)", rows: [] }));
  const nav = navigations.find((u) => u && u !== URL_ && !u.endsWith("8099/"));
  out.push({
    row: NAMES[i],
    selected: cur.selected,
    action: nav ? "link" : after.title !== "iPod" ? "screen" : "nothing",
    target: nav || after.title || "",
    shows: nav ? "" : after.rows.join(" | "),
  });
}

console.log(JSON.stringify(out, null, 1));
chrome.kill();
ws.close();
process.exit(0);
