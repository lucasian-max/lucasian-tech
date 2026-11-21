#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RATCHET_PATH = join(ROOT, ".comment-ratchet.json");
const EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".sh"]);
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".wrangler", ".opencode", "shots"]);
const SKIPPED_PREFIXES = ["tests/shots/"];

const KEYWORDS_BEFORE_REGEX = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "case", "do", "else", "yield", "await", "throw",
]);

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function markRange(lines, from, to) {
  for (let line = from; line <= to; line++) lines.add(line);
}

function countJs(source, startLine = 1) {
  const lines = new Set();
  const stack = [];
  let mode = "code";
  let prev = "";
  let i = 0;
  let line = startLine;

  const advance = () => {
    if (source[i] === "\n") line++;
    i++;
  };

  const readIdentifier = () => {
    const begin = i;
    while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) advance();
    const word = source.slice(begin, i);
    prev = KEYWORDS_BEFORE_REGEX.has(word) ? "keyword" : "value";
  };

  const readNumber = () => {
    while (i < source.length && /[0-9A-Za-z_.]/.test(source[i])) advance();
    prev = "value";
  };

  const readQuoted = (quote) => {
    advance();
    while (i < source.length) {
      const char = source[i];
      if (char === "\\") {
        advance();
        if (i < source.length) advance();
        continue;
      }
      if (char === quote) {
        advance();
        break;
      }
      if (char === "\n") break;
      advance();
    }
    prev = "value";
  };

  const readTemplate = () => {
    advance();
    mode = "template";
  };

  const readRegex = () => {
    let j = i + 1;
    let inClass = false;
    while (j < source.length) {
      const char = source[j];
      if (char === "\\") {
        j += 2;
        continue;
      }
      if (char === "\n") return false;
      if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (char === "/" && !inClass) break;
      j++;
    }
    if (j >= source.length) return false;
    j++;
    while (j < source.length && /[A-Za-z]/.test(source[j])) j++;
    while (i < j) advance();
    prev = "value";
    return true;
  };

  const regexAllowed = () => {
    if (prev === "") return true;
    if (prev === "value") return false;
    if (prev === ")" || prev === "]" || prev === "}") return false;
    if (prev === "++" || prev === "--") return false;
    return true;
  };

  while (i < source.length) {
    const char = source[i];

    if (mode === "template") {
      if (char === "\\") {
        advance();
        if (i < source.length) advance();
      } else if (char === "`") {
        advance();
        if (stack.length && stack[stack.length - 1].type === "template") stack.pop();
        mode = "code";
        prev = "value";
      } else if (char === "$" && source[i + 1] === "{") {
        advance();
        advance();
        stack.push({ type: "interp", braces: 0 });
        mode = "code";
        prev = "";
      } else {
        advance();
      }
      continue;
    }

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      advance();
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      markRange(lines, line, line);
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }

    if (char === "/" && source[i + 1] === "*") {
      const start = line;
      advance();
      advance();
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) advance();
      if (i < source.length) {
        advance();
        advance();
      }
      markRange(lines, start, line);
      continue;
    }

    if (char === "'" || char === '"') {
      readQuoted(char);
      continue;
    }

    if (char === "`") {
      stack.push({ type: "template" });
      readTemplate();
      continue;
    }

    if (char === "/" && regexAllowed() && readRegex()) continue;

    if (char === "{") {
      const top = stack[stack.length - 1];
      if (top && top.type === "interp") top.braces++;
      advance();
      prev = "{";
      continue;
    }

    if (char === "}") {
      const top = stack[stack.length - 1];
      if (top && top.type === "interp" && top.braces === 0) {
        stack.pop();
        advance();
        mode = "template";
        prev = "value";
        continue;
      }
      if (top && top.type === "interp") top.braces--;
      advance();
      prev = "}";
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      readIdentifier();
      continue;
    }

    if (/[0-9]/.test(char)) {
      readNumber();
      continue;
    }

    if ((char === "+" || char === "-") && source[i + 1] === char) {
      advance();
      advance();
      prev = char + char;
      continue;
    }

    prev = char;
    advance();
  }

  return lines;
}

function countCss(source, startLine = 1) {
  const lines = new Set();
  let i = 0;
  let line = startLine;

  const advance = () => {
    if (source[i] === "\n") line++;
    i++;
  };

  while (i < source.length) {
    const char = source[i];

    if (char === "/" && source[i + 1] === "*") {
      const start = line;
      advance();
      advance();
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) advance();
      if (i < source.length) {
        advance();
        advance();
      }
      markRange(lines, start, line);
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      advance();
      while (i < source.length) {
        if (source[i] === "\\") {
          advance();
          if (i < source.length) advance();
          continue;
        }
        if (source[i] === quote) {
          advance();
          break;
        }
        advance();
      }
      continue;
    }

    advance();
  }

  return lines;
}

function buildLineResolver(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return (index) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function countHtml(source) {
  const lines = new Set();
  const lower = source.toLowerCase();
  const lineAt = buildLineResolver(source);
  let i = 0;

  const markThrough = (start, endExclusive) => {
    if (endExclusive <= start) return;
    markRange(lines, lineAt(start), lineAt(endExclusive - 1));
  };

  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const stop = end === -1 ? source.length : end + 3;
      markThrough(i, stop);
      i = stop;
      continue;
    }

    if (lower.startsWith("<script", i)) {
      const boundary = source[i + 7];
      if (boundary === ">" || boundary === " " || boundary === "\t" || boundary === "\n" || boundary === "\r") {
        const openEnd = source.indexOf(">", i + 7);
        if (openEnd === -1) break;
        const close = lower.indexOf("</script", openEnd + 1);
        if (close === -1) break;
        const contentStart = openEnd + 1;
        const content = source.slice(contentStart, close);
        const startLine = lineAt(contentStart);
        for (const found of countJs(content, startLine)) lines.add(found);
        i = close + 8;
        continue;
      }
    }

    if (lower.startsWith("<style", i)) {
      const boundary = source[i + 6];
      if (boundary === ">" || boundary === " " || boundary === "\t" || boundary === "\n" || boundary === "\r") {
        const openEnd = source.indexOf(">", i + 6);
        if (openEnd === -1) break;
        const close = lower.indexOf("</style", openEnd + 1);
        if (close === -1) break;
        const contentStart = openEnd + 1;
        const content = source.slice(contentStart, close);
        const startLine = lineAt(contentStart);
        for (const found of countCss(content, startLine)) lines.add(found);
        i = close + 7;
        continue;
      }
    }

    i++;
  }

  return lines;
}

function countShell(source) {
  const lines = new Set();
  const rows = source.split("\n");

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const line = index + 1;
    if (line === 1 && row.startsWith("#!")) continue;

    let quote = "";
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (quote === "'") {
        if (char === "'") quote = "";
        continue;
      }
      if (quote === '"') {
        if (char === "\\") i++;
        else if (char === '"') quote = "";
        continue;
      }
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "#") {
        const before = i === 0 ? "" : row[i - 1];
        if (i === 0 || /[\s;|&(){}<>]/.test(before)) {
          lines.add(line);
          break;
        }
      }
    }
  }

  return lines;
}

export function countSource(extension, source) {
  if (extension === ".css") return countCss(source);
  if (extension === ".html") return countHtml(source);
  if (extension === ".sh") return countShell(source);
  return countJs(source);
}

function isSkipped(relativePath, name) {
  if (SKIPPED_DIRECTORIES.has(name)) return true;
  return SKIPPED_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

async function collectFiles(directory = ROOT, collected = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(directory, entry.name);
    const relativePath = relative(ROOT, full).split(sep).join("/");
    if (entry.isDirectory()) {
      if (isSkipped(relativePath, entry.name)) continue;
      await collectFiles(full, collected);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!EXTENSIONS.has(extname(entry.name))) continue;
    collected.push(relativePath);
  }
  return collected;
}

export async function scanRepository() {
  const files = await collectFiles();
  const counts = new Map();
  for (const relativePath of files) {
    const extension = extname(relativePath);
    const raw = await readFile(join(ROOT, relativePath), "utf8");
    const source = stripBom(raw);
    const found = countSource(extension, source);
    counts.set(relativePath, found.size);
  }
  return counts;
}

function emptyRatchet() {
  return { version: 1, files: {} };
}

async function loadRatchet() {
  try {
    const raw = await readFile(RATCHET_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.files !== "object" || parsed.files === null) {
      throw new Error(".comment-ratchet.json must contain a files object");
    }
    return { version: parsed.version || 1, files: { ...parsed.files } };
  } catch (error) {
    if (error.code === "ENOENT") return emptyRatchet();
    throw error;
  }
}

async function saveRatchet(ratchet) {
  const files = {};
  for (const key of Object.keys(ratchet.files).sort()) {
    const value = ratchet.files[key];
    if (Number.isInteger(value) && value > 0) files[key] = value;
  }
  const payload = JSON.stringify({ version: 1, files }, null, 2) + "\n";
  await writeFile(RATCHET_PATH, payload, "utf8");
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function printHelp() {
  console.log(`Usage: node scripts/lint-comments.mjs [options]

Options:
  --update-ratchet          Lower existing baselines to current counts (never raises them)
  --baseline <file...>      Explicitly grandfather the current counts of the given files
  --help, -h                Show this help

Rules:
  Files are scanned for .js, .mjs, .css, .html and .sh.
  A file absent from .comment-ratchet.json must have zero comment lines.
  A baselined file must not exceed its baseline.
  Run --update-ratchet after deleting comments to lock in the lower ceiling.`);
}

function parseArguments(argv) {
  const options = { update: false, baseline: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update-ratchet") options.update = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--baseline") {
      i++;
      while (i < argv.length && !argv[i].startsWith("--")) {
        options.baseline.push(argv[i]);
        i++;
      }
      i--;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const counts = await scanRepository();
  const ratchet = await loadRatchet();

  if (options.baseline.length > 0) {
    const missing = options.baseline.filter((file) => !counts.has(file));
    if (missing.length > 0) {
      throw new Error(`cannot baseline unscanned file(s): ${missing.join(", ")}`);
    }
    for (const file of options.baseline) {
      const count = counts.get(file);
      if (count === 0) {
        console.log(`skip ${file}: already at zero comments`);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(ratchet.files, file)) {
        const existing = Number(ratchet.files[file]);
        if (count > existing) {
          throw new Error(`refusing to raise ${file} from ${existing} to ${count}; the ratchet only moves down`);
        }
        console.log(`skip ${file}: already baselined at ${existing}; use --update-ratchet to lower it`);
        continue;
      }
      ratchet.files[file] = count;
      console.log(`baseline ${file}: ${plural(count, "comment line")}`);
    }
    await saveRatchet(ratchet);
    return;
  }

  if (options.update) {
    const increases = [];
    const next = { version: 1, files: {} };
    for (const [file, baseline] of Object.entries(ratchet.files)) {
      const current = counts.get(file);
      if (current === undefined) {
        console.log(`drop ${file}: file no longer exists`);
        continue;
      }
      if (current > baseline) {
        increases.push(`${file}: ${current} > ${baseline}`);
        next.files[file] = baseline;
        continue;
      }
      if (current < baseline) {
        console.log(`lower ${file}: ${baseline} -> ${current}`);
      }
      if (current > 0) next.files[file] = current;
    }
    if (increases.length > 0) {
      for (const line of increases) console.error(`FAIL ${line}`);
      console.error("refusing to update: comment counts may not increase");
      process.exitCode = 1;
      return;
    }
    await saveRatchet(next);
    console.log("ratchet updated");
    return;
  }

  const failures = [];
  const decreases = [];
  const baselined = [];

  for (const [file, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const inRatchet = Object.prototype.hasOwnProperty.call(ratchet.files, file);
    const baseline = inRatchet ? Number(ratchet.files[file]) : 0;

    if (count > baseline) {
      failures.push({ file, count, baseline, inRatchet });
      continue;
    }
    if (inRatchet && count < baseline) decreases.push({ file, count, baseline });
    if (inRatchet) baselined.push({ file, count, baseline });
  }

  for (const item of baselined) {
    console.log(`  ok   ${item.file}: ${item.count} <= ${item.baseline}`);
  }
  for (const item of decreases) {
    console.log(`  DOWN ${item.file}: ${item.count} < ${item.baseline} — run node scripts/lint-comments.mjs --update-ratchet`);
  }
  for (const item of failures) {
    if (item.inRatchet) {
      console.error(`  FAIL ${item.file}: ${plural(item.count, "comment line")} > baseline ${item.baseline}`);
    } else {
      console.error(`  FAIL ${item.file}: ${plural(item.count, "comment line")} in a file with no baseline (new files must have zero)`);
    }
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  console.log(`\ncomment-ratchet: ${plural(counts.size, "file")} scanned, ${plural(total, "comment line")} total, ${baselined.length} baselined`);

  if (failures.length > 0) {
    console.error(`comment-ratchet: ${plural(failures.length, "file")} over budget`);
    process.exitCode = 1;
    return;
  }
  console.log("comment-ratchet: pass");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`comment-ratchet: ${error.message}`);
    process.exitCode = 1;
  });
}
