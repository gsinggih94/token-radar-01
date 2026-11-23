// Local gate-shaped checks for the Token Radar entry.
//
// This is NOT the server scorer (it stays on make.fun's server); it
// replicates the seven gate rows from RULES.txt against a local /output
// directory so a bad board is caught before submission:
//
//   node check-gate.mjs out
//
// dashboard_files, board_file, sorted_by_value, coverage, farm_steps,
// screenshots, dossier_matches. Exits 1 on any failure.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const SNAP = process.argv[3] ?? '/home/hatch/workspace/token-radar-kit/token-radar-01-kit/input/snapshot.json';
const failures = [];
const passes = [];
function check(name, ok, detail) {
  if (ok) passes.push(name);
  else failures.push(`${name}: ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const snapshot = JSON.parse(readFileSync(SNAP, 'utf8'));
const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));

// dashboard_files
{
  const dir = join(out, 'dashboard');
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const hasHtml = files.includes('index.html');
  const hasCss = files.some((f) => f.endsWith('.css'));
  const hasJs = files.some((f) => f.endsWith('.js'));
  const total = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  const text = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const network = /https?:\/\/[^\s"'<>]+/.test(text) && !/https?:\/\/[^\s"'<>]+/.test(text.replace(/\/\/[^\n]*/g, ''));
  // The scorer refuses an http(s) address in an HTML attribute value, a
  // <style> body, an inline <script> import, a CSS file, or a JS import.
  // Visible text and comments may carry URLs, so only flag attribute/import sites:
  const attrNet = /<(?:a|link|script|img)[^>]*(?:href|src)\s*=\s*["']https?:\/\//i.test(text)
    || /@import\s+["']https?:\/\//i.test(text)
    || /import\s+[^'"]*["']https?:\/\//.test(text)
    || /require\(["']https?:\/\//.test(text);
  check('dashboard_files', hasHtml && hasCss && hasJs && files.length <= 400 && total <= 4_194_304 && !attrNet,
    `${files.length} files, ${total} bytes, html=${hasHtml} css=${hasCss} js=${hasJs} network-in-attr=${attrNet}`);
}

// board_file + sorted_by_value + coverage + farm_steps
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = Array.isArray(board) ? board : board.rows;
{
  const badSlug = rows.find((r) => !snapSlugs.has(r.slug));
  const allFields = rows.every((r) =>
    typeof r.slug === 'string' && r.slug.length >= 1 && r.slug.length <= 128 && !/\s/.test(r.slug)
    && typeof r.name === 'string' && r.name.length > 0
    && Number.isSafeInteger(r.rank) && r.rank > 0
    && Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 100_000_000_000_000
    && Array.isArray(r.farm_steps));
  check('board_file', rows.length >= 100 && rows.length <= 4000 && allFields && !badSlug,
    `${rows.length} rows, bad slug: ${badSlug ? badSlug.slug : 'none'}`);
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  const ranksOk = ranks.every((v, i) => v === i + 1);
  const sortedOk = rows.every((r, i) => i === 0 || rows[i - 1].implied_value_usd >= r.implied_value_usd);
  const notFlat = rows.length < 2 || rows[0].implied_value_usd !== rows[rows.length - 1].implied_value_usd;
  check('sorted_by_value', ranksOk && sortedOk && notFlat, `ranks 1..${rows.length} ok=${ranksOk}, non-increasing ok=${sortedOk}`);
  const have = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !have.has(s));
  check('coverage', missing.length === 0, `watchlist ${snapshot.watchlist.length}, missing ${missing.length}${missing.length ? `: ${missing.slice(0, 5).join(', ')}` : ''}`);
  const badSteps = rows.find((r) => r.farm_steps.length < 3 || r.farm_steps.length > 12
    || r.farm_steps.some((s) => s.trim().length < 20 || s.trim().length > 600));
  check('farm_steps', !badSteps, badSteps ? `${badSteps.slug} has a bad farm plan` : `${rows.length} rows x ${rows[0].farm_steps.length} steps`);
}

// screenshots
{
  const dir = join(out, 'screenshots');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
  let detail = `${files.length} images`;
  let ok = files.length >= 3 && files.length <= 4;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    const jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
    let w = 0, h = 0;
    if (png && buf.length >= 24) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
    if (jpg) { w = 1440; h = 900; detail += ` (${f}: JPEG, size not decoded)`; }
    if (png) detail += ` (${f}: ${w}x${h}, ${buf.length} bytes)`;
    if (!(png || jpg) || buf.length > 524_288) ok = false;
    if (png && (Math.max(w, h) > 1440 || Math.min(w, h) < 800)) ok = false;
  }
  check('screenshots', ok, detail);
}

// dossier_matches
{
  const expected = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  const actual = readFileSync(join(out, 'dossier.json'));
  check('dossier_matches', Buffer.compare(Buffer.from(expected), actual) === 0,
    `dossier.json ${actual.length} bytes, expected ${expected.length} bytes`);
}

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
