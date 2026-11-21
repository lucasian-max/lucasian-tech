#!/usr/bin/env node
/**
 * Build the iPod music catalog.
 *
 * The catalog is intentionally small and curated: one locally synthesised
 * ambient loop (always first) plus a handful of real iTunes previews.  Every
 * remote preview is resolved through Apple's public Search API and its URL is
 * checked with a real HEAD request before anything is written, so the iPod can
 * never offer a track that 404s.
 *
 * Writes byte-identical JSON to both storefront files the player probes:
 *   includes/ipod/data/us/en-US.json
 *   includes/ipod/data/us/index.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
const DATA_DIR = join(PROJECT, "includes", "ipod", "data", "us");

const STOREFRONT = "us";
const LANGUAGE = "en-US";
const SCHEMA_VERSION = 3;
const SEARCH_ENDPOINT = "https://itunes.apple.com/search";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0 Safari/537.36 lucasian.tech-ipod/1.0";
const REQUEST_GAP_MS = 2300; // stay under Apple's roughly 20 requests/minute
const MAX_ATTEMPTS = 4;

const LOCAL_SONG = {
  id: "studio-ambient-01",
  name: "Midnight Desk",
  artistName: "Studio Ambient",
  albumName: "lucasian.tech",
  previewUrl: "/assets/audio/studio-ambient.mp3",
};

// Curated tracks.  `albumHint` only breaks ties between duplicate matches.
const CURATED = [
  {
    artist: "C418",
    title: "Sweden",
    albumHint: "minecraft",
    playlists: ["pl-ambient"],
  },
  {
    artist: "Tycho",
    title: "Awake",
    albumHint: "awake",
    playlists: ["pl-ambient"],
  },
  {
    artist: "Brian Eno",
    title: "An Ending (Ascent)",
    albumHint: "apollo",
    playlists: ["pl-ambient"],
  },
  {
    artist: "Aphex Twin",
    title: "Avril 14th",
    albumHint: "drukqs",
    playlists: ["pl-ambient"],
  },
  {
    artist: "Daft Punk",
    title: "Veridis Quo",
    albumHint: "discovery",
    playlists: ["pl-late-night"],
  },
  {
    artist: "Nujabes",
    title: "Feather",
    name: "Feather",
    albumHint: "",
    playlists: ["pl-late-night"],
  },
  {
    artist: "Bonobo",
    title: "Kiara",
    albumHint: "black sands",
    playlists: ["pl-late-night"],
  },
  {
    artist: "Frank Ocean",
    title: "Pink + White",
    albumHint: "blonde",
    playlists: ["pl-late-night"],
  },
  {
    artist: "M83",
    title: "Outro",
    albumHint: "hurry up",
    playlists: ["pl-orbital"],
  },
  {
    artist: "Hans Zimmer",
    title: "Cornfield Chase",
    albumHint: "interstellar",
    playlists: ["pl-orbital"],
  },
  {
    artist: "Tame Impala",
    title: "Let It Happen",
    albumHint: "currents",
    playlists: ["pl-orbital"],
  },
];

const PLAYLISTS = [
  { id: "pl-ambient", name: "Studio Ambient" },
  { id: "pl-late-night", name: "Late Night Build" },
  { id: "pl-orbital", name: "Orbital" },
];

const PENALIZED =
  /\b(remix|remixed|live|cover|covers|tribute|karaoke|instrumental|lullaby|orchestral)\b|piano version/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function playlistMembership() {
  const map = new Map();
  for (const track of CURATED) {
    for (const playlist of track.playlists) {
      const list = map.get(playlist) ?? [];
      list.push(track);
      map.set(playlist, list);
    }
  }
  return map;
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`iTunes search failed with HTTP ${response.status}`);
    }
    const wait = 8000 * attempt;
    console.warn(`  rate limited (HTTP ${response.status}); retrying in ${wait} ms`);
    await sleep(wait);
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`iTunes search failed with HTTP ${response.status}`);
  }
  return response.json();
}

function scoreResult(result, spec) {
  if (result.wrapperType !== "track" || result.kind !== "song") return -1;
  if (normalize(result.artistName) !== normalize(spec.artist)) return -1;
  if (!/^https:\/\//.test(result.previewUrl ?? "")) return -1;

  const wanted = normalize(spec.title);
  const actual = normalize(result.trackName);
  let score = -1;
  if (actual === wanted) {
    score = 100;
  } else if (
    actual.startsWith(`${wanted} `) &&
    /\(feat\.?\s/i.test(result.trackName)
  ) {
    score = 80;
  }
  if (score < 0) return -1;

  const haystack = `${result.trackName} ${result.collectionName}`;
  if (PENALIZED.test(haystack)) score -= 30;
  if (spec.albumHint && normalize(result.collectionName).includes(normalize(spec.albumHint))) {
    score += 15;
  }
  return score;
}

async function resolveTrack(spec) {
  const term = `${spec.artist} ${spec.title}`;
  const url = `${SEARCH_ENDPOINT}?${new URLSearchParams({
    media: "music",
    entity: "song",
    limit: "5",
    term,
  })}`;
  const payload = await fetchJson(url);
  const results = Array.isArray(payload.results) ? payload.results : [];
  let best = null;
  let bestScore = -1;
  for (const result of results) {
    const score = scoreResult(result, spec);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  if (!best) {
    throw new Error(
      `No exact iTunes match for "${spec.artist} - ${spec.title}" ` +
        `(got: ${results.map((r) => `${r.artistName} / ${r.trackName}`).join(", ") || "none"})`,
    );
  }
  return {
    spec,
    result: best,
    id: slugify(`${spec.artist} ${spec.title}`),
  };
}

async function verifyPreview(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 200) return true;
      if (attempt === 3) {
        throw new Error(`preview HEAD returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await sleep(1200 * attempt);
  }
  return false;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Building curated iPod catalog ...");
  const resolved = [];
  const seenIds = new Set([LOCAL_SONG.id]);

  for (const spec of CURATED) {
    process.stdout.write(`  ${spec.artist} - ${spec.title} ... `);
    const track = await resolveTrack(spec);
    assert(!seenIds.has(track.id), `Duplicate song id: ${track.id}`);
    seenIds.add(track.id);
    resolved.push(track);
    console.log(`"${track.result.trackName}" (${track.result.collectionName})`);
    await sleep(REQUEST_GAP_MS);
  }

  // Verify every remote preview before we commit anything to disk.
  console.log("Verifying preview URLs ...");
  const songs = [LOCAL_SONG];
  for (const track of resolved) {
    const previewUrl = track.result.previewUrl;
    const ok = await verifyPreview(previewUrl);
    assert(ok, `Preview did not return HTTP 200: ${previewUrl}`);
    songs.push({
      id: track.id,
      name: track.spec.name ?? track.result.trackName,
      artistName: track.result.artistName,
      albumName: track.result.collectionName,
      previewUrl,
    });
    console.log(`  ok  ${track.result.artistName} - ${track.spec.name ?? track.result.trackName}`);
    await sleep(150);
  }

  const members = playlistMembership();
  const trackIdBySpec = new Map(resolved.map((track) => [track.spec, track.id]));
  const playlists = PLAYLISTS.map((playlist) => {
    const ids = playlist.id === "pl-ambient" ? [LOCAL_SONG.id] : [];
    for (const spec of members.get(playlist.id) ?? []) {
      ids.push(trackIdBySpec.get(spec));
    }
    return { id: playlist.id, name: playlist.name, songIds: ids };
  });

  const artistNames = [...new Set(songs.map((song) => song.artistName))].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  const artists = artistNames.map((name) => ({
    id: `artist-${slugify(name)}`,
    name,
    songIds: songs.filter((song) => song.artistName === name).map((song) => song.id),
  }));

  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    storefront: STOREFRONT,
    language: LANGUAGE,
    songs,
    artists,
    playlists,
  };

  // --- integrity checks -----------------------------------------------------
  const songIds = new Set(songs.map((song) => song.id));
  assert(songIds.size === songs.length, "Song ids are not unique");
  assert(songs[0].id === LOCAL_SONG.id, "The local ambient loop must be the first song");
  assert(
    playlists[0].id === "pl-ambient" && playlists[0].songIds[0] === LOCAL_SONG.id,
    "The local ambient loop must open pl-ambient",
  );
  assert(resolved.length >= 10 && resolved.length <= 12,
    `Expected 10-12 real tracks, got ${resolved.length}`);
  assert(songs.length === resolved.length + 1, "Unexpected song count");
  for (const playlist of playlists) {
    assert(playlist.songIds.length > 1, `${playlist.id} has no curated tracks`);
    for (const id of playlist.songIds) {
      assert(songIds.has(id), `${playlist.id} references unknown song ${id}`);
    }
  }
  for (const artist of artists) {
    assert(artist.songIds.length > 0, `${artist.name} has no songs`);
    for (const id of artist.songIds) {
      assert(songIds.has(id), `${artist.id} references unknown song ${id}`);
    }
  }
  const covered = new Set(playlists.flatMap((playlist) => playlist.songIds));
  for (const song of songs) {
    assert(covered.has(song.id), `Song ${song.id} is not in any playlist`);
  }

  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  await mkdir(DATA_DIR, { recursive: true });
  const outputs = [
    join(DATA_DIR, "en-US.json"),
    join(DATA_DIR, "index.json"),
  ];
  for (const output of outputs) {
    await writeFile(output, json, "utf8");
    console.log(`  wrote ${output}`);
  }

  console.log(
    `Catalog ready: ${songs.length} songs (${resolved.length} real + 1 local), ` +
      `${artists.length} artists, ${playlists.length} playlists.`,
  );
}

main().catch((error) => {
  console.error(`\nCatalog build failed: ${error.message}`);
  process.exitCode = 1;
});
