import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.MUSIC_ROOT
  ? resolve(process.env.MUSIC_ROOT)
  : resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHOT_DIR = join(ROOT, "tests", "shots");
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium";
const CDP_PORT = 9347;
const HTTP_PORT = 8137;

mkdirSync(SHOT_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer((req, res) => {
  const cleanPath = (req.url || "/").split("?")[0];
  let filePath = join(ROOT, cleanPath === "/" ? "index.html" : cleanPath);
  try {
    const st = statSync(filePath);
    if (st.isDirectory()) filePath = join(filePath, "index.html");
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Content-Length": body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? " - " + detail : ""}`);
  }
};

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${mkdtempSync("/tmp/music-chr-")}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    "about:blank",
  ],
  { env: { ...process.env, TMPDIR: "/tmp" } }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("Chromium CDP did not start");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(m.params?.exceptionDetails?.text || "exception");
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    consoleErrors.push(txt);
  }
  if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
    consoleErrors.push(m.params.entry.text);
  }
};

const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { result: tgt } = await send("Target.createTarget", { url: "about:blank" });
const { result: att } = await send("Target.attachToTarget", { targetId: tgt.targetId, flatten: true });
const S = att.sessionId;

await send("Runtime.enable", {}, S);
await send("Page.enable", {}, S);
await send("Log.enable", {}, S);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, S);

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

async function waitFor(expr, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evalJs(expr)) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

async function shot(filename) {
  if (process.env.SKIP_SHOTS === "1") return;
  const r = await Promise.race([
    send("Page.captureScreenshot", { format: "png" }, S),
    sleep(5000).then(() => ({ timeout: true })),
  ]);
  if (r.timeout) {
    console.log(`  ..   screenshot skipped: ${filename}`);
    return;
  }
  writeFileSync(join(SHOT_DIR, filename), Buffer.from(r.result.data, "base64"));
}

async function press(key, code, keyCode) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  }, S);
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  }, S);
}

const PILL = `(() => {
  const pill = document.getElementById('music-pill');
  const toggle = document.getElementById('music-toggle');
  const next = document.getElementById('music-next');
  const mute = document.querySelector('.mute-glyph');
  const sound = document.querySelector('.sound-glyph');
  const pb = (window.__IPOD_BRIDGE && window.__IPOD_BRIDGE.getPlayback()) || {};
  const screen = window.__IPOD_SCREEN || {};
  return {
    title: document.getElementById('music-title')?.textContent?.trim(),
    artist: document.getElementById('music-artist')?.textContent?.trim(),
    playing: pill?.getAttribute('data-playing'),
    loaded: pill?.getAttribute('data-loaded'),
    docPlaying: document.documentElement.getAttribute('data-playing'),
    ariaLabel: toggle?.getAttribute('aria-label'),
    ariaPressed: toggle?.getAttribute('aria-pressed'),
    nextHidden: !!next?.hidden,
    muteDisplay: mute ? getComputedStyle(mute).display : null,
    soundDisplay: sound ? getComputedStyle(sound).display : null,
    isPlaying: !!pb.isPlaying,
    hasLoadedItem: !!pb.hasLoadedItem,
    isLoading: !!pb.isLoading,
    currentTime: pb.currentPlaybackTime || 0,
    duration: pb.currentPlaybackDuration || 0,
    trackIndex: pb.currentTrackIndex || 0,
    queueLength: pb.queue ? pb.queue.length : 0,
    screenKey: screen.getScreenKey ? screen.getScreenKey() : null,
    selected: screen.getSelectedIndex ? screen.getSelectedIndex() : null,
  };
})()`;

const pill = () => evalJs(PILL);

async function load() {
  await send("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/` }, S);
  const ready = await waitFor(
    `!!window.__IPOD_BRIDGE && !!document.getElementById('ipod')?.shadowRoot && window.__IPOD_SCREEN`,
    15000
  );
  if (!ready) throw new Error("site did not become ready");
  await sleep(250);
}

async function startMusic() {
  await evalJs(`document.getElementById('music-toggle').click()`);
  const loaded = await waitFor(
    `(() => { const p = window.__IPOD_BRIDGE.getPlayback(); return !!p.hasLoadedItem && p.currentPlaybackDuration > 0; })()`,
    20000
  );
  if (!loaded) throw new Error("music never loaded");
  await sleep(500);
}

console.log(`\nmusic: http://127.0.0.1:${HTTP_PORT}/  root ${ROOT}\n`);

await load();
let s = await pill();
ok(
  "starts muted on Sound Off, next hidden",
  s.title === "Sound Off" && s.playing === "false" && s.loaded === "false" &&
    s.nextHidden === true && s.ariaPressed === "false" && s.ariaLabel === "Play music",
  JSON.stringify(s)
);
ok(
  "nothing loads until you press play",
  s.hasLoadedItem === false && s.isLoading === false && s.isPlaying === false && s.currentTime === 0,
  JSON.stringify({ hasLoadedItem: s.hasLoadedItem, isLoading: s.isLoading, isPlaying: s.isPlaying, currentTime: s.currentTime })
);

await evalJs(`document.getElementById('music-track').click()`);
await sleep(600);
s = await pill();
ok(
  "LCD click opens Songs without playing",
  s.screenKey === "songs" && s.isPlaying === false && s.isLoading === false && s.currentTime === 0,
  JSON.stringify(s)
);
await shot("music-desktop-songs.png");

await load();
s = await pill();
const nextHiddenBeforeLoad = s.nextHidden;
const loadingState = await evalJs(`(() => {
  document.getElementById('music-toggle').click();
  const p = window.__IPOD_BRIDGE.getPlayback();
  return {
    isLoading: !!p.isLoading,
    hasLoadedItem: !!p.hasLoadedItem,
    hidden: !!document.getElementById('music-next').hidden,
  };
})()`);
await waitFor(
  `(() => { const p = window.__IPOD_BRIDGE.getPlayback(); return !!p.hasLoadedItem && p.currentPlaybackDuration > 0; })()`,
  20000
);
await sleep(500);
s = await pill();
ok(
  "speaker starts 8 songs at Gypsy",
  s.isPlaying === true && s.title === "Gypsy" && s.artist === "Fleetwood Mac" &&
    s.queueLength === 8 && s.trackIndex === 0 && s.duration > 180,
  JSON.stringify({ title: s.title, artist: s.artist, queueLength: s.queueLength, duration: s.duration })
);
ok(
  "next stays hidden while loading",
  loadingState.isLoading === true && loadingState.hasLoadedItem === false && loadingState.hidden === true,
  JSON.stringify(loadingState)
);
ok(
  "next appears when a track loads",
  nextHiddenBeforeLoad === true && s.nextHidden === false,
  JSON.stringify({ before: nextHiddenBeforeLoad, after: s.nextHidden })
);

await evalJs(`document.getElementById('music-toggle').click()`);
await waitFor(`!window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await sleep(350);
s = await pill();
ok(
  "pause shows Paused and swaps the icon",
  s.title === "Paused" && s.artist === "Fleetwood Mac" && s.isPlaying === false &&
    s.playing === "false" && s.docPlaying === "false" && s.ariaPressed === "false" &&
    s.ariaLabel === "Play music" && s.muteDisplay !== "none" && s.soundDisplay === "none",
  JSON.stringify(s)
);
const pausedAt = (await pill()).currentTime;

await sleep(1200);
await evalJs(`document.getElementById('music-toggle').click()`);
await waitFor(`window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await sleep(1800);
s = await pill();
ok(
  "resume picks up where it stopped",
  Math.abs(s.currentTime - pausedAt) <= 3 && s.isPlaying === true,
  JSON.stringify({ pausedAt: Math.round(pausedAt * 10) / 10, resumedAt: Math.round(s.currentTime * 10) / 10 })
);

await evalJs(`document.getElementById('music-toggle').click()`);
await waitFor(`!window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await sleep(300);
const pausedIndex = (await pill()).trackIndex;
await evalJs(`window.__IPOD_BRIDGE.nextTrack()`);
await waitFor(`window.__IPOD_BRIDGE.getPlayback().currentTrackIndex !== ${pausedIndex}`, 4000);
await sleep(300);
s = await pill();
ok(
  "next while paused keeps it paused",
  s.trackIndex !== pausedIndex && s.isPlaying === false && s.playing === "false" && s.nextHidden === false,
  JSON.stringify({ pausedIndex, trackIndex: s.trackIndex, isPlaying: s.isPlaying })
);

await evalJs(`window.__IPOD_BRIDGE.getPlayback().isPlaying ? null : document.getElementById('music-toggle').click()`);
await waitFor(`window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await evalJs(`window.__IPOD_BRIDGE.openScreen('about')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'about'`, 4000);
await sleep(11000);
s = await pill();
ok(
  "stays on About for 11 s while playing",
  s.screenKey === "about" && s.isPlaying === true,
  JSON.stringify({ screenKey: s.screenKey, isPlaying: s.isPlaying })
);

await load();
await evalJs(`(() => {
  window.__pmCalls = 0;
  const original = window.__IPOD_SCREEN.playAmbient;
  window.__IPOD_SCREEN.playAmbient = function () {
    window.__pmCalls += 1;
    return original.apply(this, arguments);
  };
})()`);
await evalJs(`(() => {
  const b = document.getElementById('music-toggle');
  b.click();
  b.click();
})()`);
await waitFor(`!!window.__IPOD_BRIDGE.getPlayback().hasLoadedItem`, 20000);
await sleep(600);
const pmCalls = await evalJs(`window.__pmCalls`);
s = await pill();
ok(
  "double click loads music once",
  pmCalls === 1,
  `playAmbient calls=${pmCalls}`
);
ok(
  "double click does not restart the queue",
  s.hasLoadedItem === true && s.isPlaying === true && s.trackIndex === 0 && s.currentTime < 6,
  JSON.stringify({ hasLoadedItem: s.hasLoadedItem, isPlaying: s.isPlaying, trackIndex: s.trackIndex, currentTime: s.currentTime })
);

await load();
await evalJs(`window.__IPOD_BRIDGE.openScreen('songs')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'songs'`, 4000);
await sleep(300);
const selectedBefore = await evalJs(`window.__IPOD_SCREEN.getSelectedIndex()`);
await evalJs(`(() => {
  const b = document.getElementById('music-toggle');
  b.focus();
  b.click();
})()`);
await sleep(150);
await press("ArrowDown", "ArrowDown", 40);
await sleep(450);
const selectedAfter = await evalJs(`window.__IPOD_SCREEN.getSelectedIndex()`);
ok(
  "arrow keys work after clicking the remote",
  selectedAfter !== selectedBefore,
  JSON.stringify({ before: selectedBefore, after: selectedAfter })
);
await evalJs(`document.getElementById('music-toggle').focus()`);
await sleep(80);
await press("Escape", "Escape", 27);
await sleep(500);
const screenAfterEscape = await evalJs(`window.__IPOD_SCREEN.getScreenKey()`);
ok(
  "Escape goes back to the menu after a click",
  screenAfterEscape === "main",
  JSON.stringify({ screenKey: screenAfterEscape })
);

await load();
await startMusic();
let ended = false;
for (let i = 0; i < 12 && !ended; i++) {
  await evalJs(`window.__IPOD_BRIDGE.nextTrack()`);
  await sleep(320);
  ended = await evalJs(`!window.__IPOD_BRIDGE.getPlayback().hasLoadedItem`);
}
await waitFor(`(() => { const p = window.__IPOD_BRIDGE.getPlayback(); return !p.hasLoadedItem && p.queue.length === 0; })()`, 6000);
await sleep(400);
s = await pill();
ok(
  "queue ending resets to Sound Off",
  s.title === "Sound Off" && s.playing === "false" && s.loaded === "false" &&
    s.nextHidden === true && s.isPlaying === false && s.ariaPressed === "false",
  JSON.stringify(s)
);

await load();
await startMusic();
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await sleep(600);
const mobile = await evalJs(`(() => {
  const r = document.getElementById('music-pill').getBoundingClientRect();
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    vw: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    title: document.getElementById('music-title')?.textContent?.trim(),
  };
})()`);
ok(
  "phone layout keeps the song playing",
  mobile.left >= 0 && mobile.right <= mobile.vw + 1 && mobile.top >= 0 &&
    mobile.bottom <= 844 && mobile.scrollWidth <= 391 && mobile.title === "Gypsy",
  JSON.stringify(mobile)
);
await shot("music-mobile-playing.png");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, S);
await sleep(300);

await load();
await startMusic();
await sleep(700);
await shot("music-desktop-playing.png");
await evalJs(`document.getElementById('music-toggle').click()`);
await waitFor(`!window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await sleep(400);
s = await pill();
await shot("music-desktop-paused.png");
ok(
  "paused state is Paused",
  s.title === "Paused" && s.playing === "false" && s.isPlaying === false && s.muteDisplay !== "none",
  JSON.stringify({ title: s.title, playing: s.playing, isPlaying: s.isPlaying })
);

await load();
await evalJs(`window.__IPOD_BRIDGE.openScreen('songs')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'songs'`, 4000);
await evalJs(`window.__IPOD_BRIDGE.activateIndex(7)`);
await waitFor(
  `(() => { const p = window.__IPOD_BRIDGE.getPlayback(); return !!p.hasLoadedItem && p.currentPlaybackDuration > 0; })()`,
  20000
);
await sleep(500);
const newTrack = await evalJs(`(() => {
  const p = window.__IPOD_BRIDGE.getPlayback();
  const t = p.queue[p.currentTrackIndex] || {};
  return {
    name: t.name,
    artist: t.artistName,
    duration: Math.round(p.currentPlaybackDuration),
    queueLength: p.queue.length,
    playing: !!p.isPlaying,
    pill: document.getElementById('music-title')?.textContent?.trim(),
  };
})()`);
ok(
  "All Along the Watchtower plays",
  newTrack.name === "All Along the Watchtower" && newTrack.artist === "Jimi Hendrix" &&
    newTrack.duration > 230 && newTrack.queueLength === 8 && newTrack.playing === true,
  JSON.stringify(newTrack)
);

await load();
await startMusic();
await evalJs(`window.__IPOD_BRIDGE.openScreen('main')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'main'`, 4000);
await evalJs(`window.__IPOD_BRIDGE.activateIndex(0)`);
await sleep(400);
s = await pill();
ok(
  "Music row opens Now Playing while playing",
  s.screenKey === "now-playing" && s.trackIndex === 0 && s.isPlaying === true,
  JSON.stringify({ screenKey: s.screenKey, trackIndex: s.trackIndex, isPlaying: s.isPlaying })
);

await evalJs(`window.__IPOD_BRIDGE.openScreen('main')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'main'`, 4000);
await evalJs(`document.getElementById('music-pill').click()`);
await sleep(400);
s = await pill();
ok(
  "clicking the pill opens Now Playing",
  s.screenKey === "now-playing" && s.trackIndex === 0,
  JSON.stringify({ screenKey: s.screenKey, trackIndex: s.trackIndex })
);

await evalJs(`document.getElementById('ipod').shadowRoot.querySelector('.select-button').click()`);
await waitFor(`!window.__IPOD_BRIDGE.getPlayback().isPlaying`, 4000);
await sleep(300);
s = await pill();
ok(
  "center pauses on Now Playing",
  s.screenKey === "now-playing" && s.isPlaying === false && s.title === "Paused",
  JSON.stringify({ screenKey: s.screenKey, isPlaying: s.isPlaying, title: s.title })
);

await evalJs(`document.getElementById('ipod').shadowRoot.querySelector('.forward-button').click()`);
await waitFor(`window.__IPOD_BRIDGE.getPlayback().currentTrackIndex === 1`, 4000);
await sleep(300);
s = await pill();
ok(
  "forward skips on Now Playing",
  s.screenKey === "now-playing" && s.trackIndex === 1 && s.isPlaying === false,
  JSON.stringify({ screenKey: s.screenKey, trackIndex: s.trackIndex, isPlaying: s.isPlaying })
);

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, S);
await load();
await evalJs(`window.__IPOD_BRIDGE.openScreen('songs')`);
await waitFor(`window.__IPOD_SCREEN.getScreenKey() === 'songs'`, 4000);
const rowPoint = await evalJs(`(() => {
  const r = document.getElementById('ipod').shadowRoot;
  const lists = r.querySelectorAll('.menu-items');
  const row = lists[lists.length - 1].querySelectorAll('.menu-item')[2];
  const b = row.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rowPoint.x, y: rowPoint.y }] }, S);
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, S);
await waitFor(
  `(() => { const p = window.__IPOD_BRIDGE.getPlayback(); return !!p.hasLoadedItem && p.queue[p.currentTrackIndex]?.name === 'The Chain'; })()`,
  6000
).catch(() => false);
s = await pill();
ok(
  "tap a song row to play it",
  s.screenKey === "now-playing" && s.trackIndex === 2 && s.isPlaying === true,
  JSON.stringify({ screenKey: s.screenKey, trackIndex: s.trackIndex, isPlaying: s.isPlaying })
);
await send("Emulation.setTouchEmulationEnabled", { enabled: false }, S);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, S);

ok(
  "no console or page errors",
  consoleErrors.length === 0 && pageErrors.length === 0,
  JSON.stringify({ consoleErrors: consoleErrors.slice(0, 4), pageErrors: pageErrors.slice(0, 4) })
);

console.log(`\n${pass} passed, ${fail} failed\n`);
ws.close();
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);
