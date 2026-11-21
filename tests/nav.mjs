import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.SMOKE_URL || "http://localhost:8099/";
const PORT = 9334;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") => (c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`)));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "nav-"))}`,
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
await sleep(3000);

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

const key = async (k, code, kc) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await sleep(180);
};
const down = () => key("ArrowDown", "ArrowDown", 40);
const up = () => key("ArrowUp", "ArrowUp", 38);
const enter = () => key("Enter", "Enter", 13);
const esc = () => key("Escape", "Escape", 27);

const state = () =>
  evaluate(`(() => {
    const r = document.querySelector('web-music-ipod').shadowRoot;
    const sel = r.querySelector('[aria-selected="true"]');
    const title = r.querySelector('.menu-title');
    return {
      selected: sel ? sel.textContent.trim() : null,
      title: title ? title.textContent.trim() : null,
      rows: [...r.querySelectorAll('[role="option"], li')].map(n => n.textContent.trim()).filter(Boolean)
    };
  })()`);

console.log(`\nnav: ${URL_}\n`);

await evaluate(`(() => {
  const r = document.querySelector('web-music-ipod').shadowRoot;
  const w = r.querySelector('.scroll-wheel, [role="slider"], .wheel');
  const target = w || r.host;
  if (target && target.focus) target.focus();
  return true;
})()`);
await sleep(300);

const s0 = await state();
ok("starts on the root menu", s0.title === "iPod" || s0.rows.includes("Music"), JSON.stringify(s0));
ok("root has 6 rows", ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"].every((x) => s0.rows.includes(x)), JSON.stringify(s0.rows));

const before = (await state()).selected;
await down();
await down();
const s2 = await state();
ok("wheel moves the selection", s2.selected !== before, `${before} -> ${s2.selected}`);

await enter();
await sleep(400);
const projects = await state();
ok("Projects screen opens", projects.title === "Projects", JSON.stringify({ title: projects.title, rows: projects.rows }));
ok("Projects lists real project rows", projects.rows.some((r) => /Navidrome|Kavita|Books|Usage/.test(r)), JSON.stringify(projects.rows));

await esc();
await sleep(350);
const back = await state();
ok("Escape returns to the root menu", (back.title === "iPod") || back.rows.includes("Music"), JSON.stringify({ title: back.title }));

const rowsNow = back.rows;
ok("root restored after back", ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"].every((x) => rowsNow.includes(x)), JSON.stringify(rowsNow));

const shot = await send("Page.captureScreenshot", { format: "png" }, S);
writeFileSync(join(process.cwd(), "assets", "screenshot.png"), Buffer.from(shot.result.data, "base64"));
console.log("  ..   wrote assets/screenshot.png");

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
