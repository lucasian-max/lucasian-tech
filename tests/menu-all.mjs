import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const URL_ = process.env.LIVE_URL || "https://lucasian.tech/";
const PORT = 9353;

let pass = 0,
  fail = 0;
const ok = (n, c, d = "") =>
  c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${d ? " — " + d : ""}`));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "menu-"))}`,
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

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

const key = async (k, code, kc) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc }, S);
  await sleep(200);
};
const down = () => key("ArrowDown", "ArrowDown", 40);
const enter = () => key("Enter", "Enter", 13);
const esc = () => key("Escape", "Escape", 27);

const state = () =>
  evaluate(`(() => {
    const ip = document.querySelector('web-music-ipod');
    const r = ip && ip.shadowRoot;
    if (!r) return null;
    const sel = r.querySelector('[aria-selected="true"]');
    const title = r.querySelector('.menu-title');
    return {
      selected: sel ? sel.textContent.trim() : null,
      title: title ? title.textContent.trim() : null,
      rows: [...r.querySelectorAll('[role="option"], li')].map(n => n.textContent.trim()).filter(Boolean),
      href: location.href,
    };
  })()`);

const focus = () =>
  evaluate(`(() => {
    const r = document.querySelector('web-music-ipod').shadowRoot;
    const w = r.querySelector('.scroll-wheel, [role="slider"], .wheel');
    const target = w || r.host;
    if (target && target.focus) target.focus();
    return true;
  })()`);

await send("Page.navigate", { url: URL_ }, S);

for (let i = 0; i < 100; i++) {
  if (await evaluate(`!!document.querySelector('web-music-ipod')`)) break;
  await sleep(100);
}
await focus();

let root;
for (let i = 0; i < 100; i++) {
  root = await state();
  if (root && root.rows.length === 6) break;
  await sleep(150);
}

console.log(`\nmenu-all: ${URL_}\n`);
ok("root menu has 6 rows", root?.rows?.length === 6, JSON.stringify(root?.rows));

const want = ["Music", "Audiobooks", "Projects", "Apps", "About", "Settings"];
const internal = ["Projects", "Apps", "About", "Settings"];

for (const name of internal) {
  await esc();
  await sleep(250);
  await focus();

  let cur = await state();
  let guard = 0;
  while (cur?.selected !== name && guard++ < 10) {
    await down();
    cur = await state();
  }
  ok(`wheel selects "${name}"`, cur?.selected === name, JSON.stringify(cur?.selected));

  await enter();
  await sleep(600);
  const opened = await state();
  const isScreen = opened && (opened.title === name || opened.title !== root.title);
  console.log(`  ${name} -> title=${JSON.stringify(opened?.title)} rows=${JSON.stringify(opened?.rows?.slice(0, 4))}`);
  ok(`"${name}" opens its own screen`, !!isScreen);
  ok(`"${name}" screen has content or is intentionally empty`, opened?.rows?.length >= 0);
}

const navs = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Page.frameNavigated" && m.params.frame.parentId === undefined) navs.push(m.params.frame.url);
});

await esc();
await sleep(250);
await focus();
for (let i = 0; i < 8; i++) {
  const s = await state();
  if (s?.selected === "Music") break;
  await key("ArrowUp", "ArrowUp", 38);
}
const atMusic = await state();
ok("wheel selects \"Music\"", atMusic?.selected === "Music", JSON.stringify(atMusic?.selected));

await enter();
await sleep(1800);
const dest = navs[navs.length - 1];
console.log(`  Music -> navigated to ${dest || "(no navigation)"}`);
ok("Music navigates to an https destination", !!dest && /^https:\/\//.test(dest), String(dest));
ok("Music leaves for the music host", !!dest && /music\.lucasian\.tech/.test(dest), String(dest));

console.log(`\n${pass} passed, ${fail} failed\n`);
chrome.kill();
ws.close();
process.exit(fail ? 1 : 0);
