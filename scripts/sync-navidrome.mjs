#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
const DATA_DIR = join(PROJECT, "includes", "ipod", "data", "us");

const SEARCH_ENDPOINT = "https://itunes.apple.com/search";
const UA = "Mozilla/5.0 (X11; Linux x86_64) lucasian.tech-ipod/2.0";
const REQUEST_GAP_MS = 1800;

const LOCAL_SONG = {
  id: "studio-ambient-01",
  name: "Midnight Desk",
  artistName: "Studio Ambient",
  albumName: "lucasian.tech",
  previewUrl: "/assets/audio/studio-ambient.mp3",
};

const AUDIOBOOK_AUTHORS = new Set([
  "dan simmons",
  "frank herbert",
  "cixin liu",
  "brandon sanderson",
]);

const CHILL_ARTISTS = new Set([
  "the beatles",
  "radiohead",
  "fleetwood mac",
  "daft punk",
  "pink floyd",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(s) {
  return norm(s).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "track";
}

function cleanTitle(t) {
  return String(t ?? "")
    .replace(/\s*\(20\d\d\s+Mix\)/i, "")
    .replace(/\s*\(including .*?\)/i, "")
    .replace(/\s*\(Live.*?\)/i, "")
    .replace(/\.\s*$/, "")
    .trim();
}

async function fetchFromSubsonic() {
  const base = process.env.NAVIDROME_URL?.replace(/\/+$/, "");
  const user = process.env.NAVIDROME_USER;
  const pass = process.env.NAVIDROME_PASS;
  if (!base || !user || !pass) return null;

  const salt = randomBytes(6).toString("hex");
  const token = createHash("md5").update(pass + salt).digest("hex");
  const qs = (endpoint, extra = {}) => {
    const u = new URL(`${base}/rest/${endpoint}`);
    u.searchParams.set("u", user);
    u.searchParams.set("t", token);
    u.searchParams.set("s", salt);
    u.searchParams.set("v", "1.16.1");
    u.searchParams.set("c", "lucasian-ipod");
    u.searchParams.set("f", "json");
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
    return u.toString();
  };

  const albumsRes = await fetch(qs("getAlbumList2", { type: "frequent", size: 12 }));
  const albumsJson = await albumsRes.json();
  const albums = albumsJson?.["subsonic-response"]?.albumList2?.album || [];

  const songs = [];
  for (const alb of albums) {
    if (AUDIOBOOK_AUTHORS.has(norm(alb.artist))) continue;
    const detailRes = await fetch(qs("getAlbum", { id: alb.id }));
    const detailJson = await detailRes.json();
    const list = detailJson?.["subsonic-response"]?.album?.song || [];
    for (const s of list) {
      songs.push({
        title: cleanTitle(s.title),
        artist: s.artist,
        album: s.album || alb.name || "",
        playCount: Number(s.playCount || 0),
      });
    }
  }
  songs.sort((a, b) => b.playCount - a.playCount);
  return songs;
}

function fetchFromNode1Sqlite() {
  const py = [
    "import sqlite3, json",
    'con = sqlite3.connect("/home/ubuntu/services/navidrome/data/navidrome.db")',
    "cur = con.cursor()",
    'rows = cur.execute("""',
    "  SELECT m.title, m.artist, m.album, COALESCE(a.play_count, 0) as pc, COALESCE(a.starred, 0) as st",
    "  FROM media_file m",
    "  LEFT JOIN annotation a ON a.item_id = m.id",
    "  WHERE COALESCE(m.duration, 0) < 900",
    "  ORDER BY st DESC, pc DESC, m.artist ASC, m.track_number ASC",
    "  LIMIT 120",
    '""").fetchall()',
    'print(json.dumps([{"title":r[0],"artist":r[1],"album":r[2],"playCount":r[3],"starred":r[4]} for r in rows]))',
  ].join("\n");

  const out = execFileSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "node1", `python3 -c '${py.replace(/'/g, "'\\''")}'`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out).map((r) => ({
    ...r,
    title: cleanTitle(r.title),
  }));
}

function selectBalancedTracks(rawTracks) {
  const picked = [];
  const seenKey = new Set();
  const perArtist = new Map();

  const candidates = rawTracks.filter((t) => {
    if (!t.title || !t.artist) return false;
    if (AUDIOBOOK_AUTHORS.has(norm(t.artist))) return false;
    return true;
  });

  for (const t of candidates) {
    if (picked.length >= 10) break;
    const key = `${norm(t.artist)}::${norm(t.title)}`;
    if (seenKey.has(key)) continue;
    const count = perArtist.get(norm(t.artist)) || 0;
    if (count >= 3) continue;
    seenKey.add(key);
    perArtist.set(norm(t.artist), count + 1);
    picked.push(t);
  }

  const signature = [
    { artist: "Deftones", title: "Change (In the House of Flies)", album: "White Pony", playCount: 2 },
    { artist: "Daft Punk", title: "Veridis Quo", album: "Discovery", playCount: 1 },
    { artist: "Pink Floyd", title: "Another Brick in the Wall, Pt. 2", album: "The Wall", playCount: 1 },
    { artist: "Led Zeppelin", title: "Kashmir", album: "Physical Graffiti", playCount: 1 },
    { artist: "King Crimson", title: "21st Century Schizoid Man", album: "In the Court of the Crimson King", playCount: 4 },
    { artist: "Cream", title: "Tales of Brave Ulysses", album: "Disraeli Gears", playCount: 9 },
  ];
  for (const s of signature) {
    if (picked.length >= 14) break;
    if (perArtist.has(norm(s.artist))) continue;
    const key = `${norm(s.artist)}::${norm(s.title)}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    perArtist.set(norm(s.artist), 1);
    picked.push(s);
  }

  return picked;
}

async function resolvePreview(track) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "6");
  url.searchParams.set("term", `${track.artist} ${track.title}`);

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const targetArtist = norm(track.artist);
  const targetTitle = norm(track.title);

  const scored = (data.results || [])
    .filter((r) => r.previewUrl && /^https:\/\//.test(r.previewUrl))
    .map((r) => {
      const ra = norm(r.artistName);
      const rt = norm(r.trackName);
      let score = 0;
      if (ra === targetArtist) score += 6;
      else if (ra.includes(targetArtist) || targetArtist.includes(ra)) score += 3;
      if (rt === targetTitle) score += 6;
      else if (rt.includes(targetTitle) || targetTitle.includes(rt)) score += 3;
      if (/\b(karaoke|tribute|cover|lullaby|remix)\b/i.test(r.trackName + " " + r.collectionName)) score -= 8;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const { r, score } of scored) {
    if (score < 5) continue;
    try {
      const head = await fetch(r.previewUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      if (head.ok) {
        return {
          id: `${slug(r.artistName)}-${slug(r.trackName)}`,
          name: cleanTitle(r.trackName),
          artistName: r.artistName,
          albumName: r.collectionName || track.album || "",
          previewUrl: r.previewUrl,
          playCount: track.playCount || 0,
        };
      }
    } catch {}
  }
  return null;
}

async function main() {
  let raw = await fetchFromSubsonic();
  let source = "Subsonic API";
  if (!raw) {
    raw = fetchFromNode1Sqlite();
    source = "Navidrome (node1)";
  }
  console.log(`Source: ${source} (${raw.length} tracks inspected)`);

  const picks = selectBalancedTracks(raw);
  const resolved = [];
  const seenIds = new Set([LOCAL_SONG.id]);

  for (const p of picks) {
    const match = await resolvePreview(p);
    await sleep(REQUEST_GAP_MS);
    if (!match || seenIds.has(match.id)) {
      console.log(`  skip  ${p.artist} - ${p.title}`);
      continue;
    }
    seenIds.add(match.id);
    resolved.push(match);
    console.log(`  ok    ${match.artistName} - ${match.name} (plays: ${match.playCount})`);
  }

  const songs = [
    LOCAL_SONG,
    ...resolved.map(({ playCount, ...song }) => song),
  ];

  const artistMap = new Map();
  for (const s of songs) {
    const list = artistMap.get(s.artistName) || [];
    list.push(s.id);
    artistMap.set(s.artistName, list);
  }
  const artists = [...artistMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, songIds]) => ({
      id: `artist-${slug(name)}`,
      name,
      songIds,
    }));

  const ambientIds = [
    LOCAL_SONG.id,
    ...resolved.filter((s) => CHILL_ARTISTS.has(norm(s.artistName))).slice(0, 4).map((s) => s.id),
  ];
  const onRepeatIds = [...resolved]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 7)
    .map((s) => s.id);
  const heavyIds = resolved
    .filter((s) => !onRepeatIds.slice(0, 4).includes(s.id))
    .map((s) => s.id);

  const playlists = [
    { id: "pl-ambient", name: "Studio Ambient", songIds: ambientIds },
    { id: "pl-repeat", name: "On Repeat", songIds: onRepeatIds },
    { id: "pl-rotation", name: "Heavy Rotation", songIds: heavyIds.length ? heavyIds : onRepeatIds },
  ];

  const payload = `${JSON.stringify(
    {
      schemaVersion: 3,
      storefront: "us",
      language: "en-US",
      songs,
      artists,
      playlists,
    },
    null,
    2
  )}\n`;

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "en-US.json"), payload, "utf8");
  await writeFile(join(DATA_DIR, "index.json"), payload, "utf8");
  console.log(`\nWrote ${songs.length} songs, ${artists.length} artists, ${playlists.length} playlists.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
