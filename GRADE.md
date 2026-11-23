# GRADE.md — local verification of the Token Radar entry

Built 2026-11-23 from the official kit downloaded from
`https://make.fun/c/token-radar-01/kit` (bundle sha256
`ea1c9dccab78e6846655e81b921a79465c7267677ea2e0908624ddbc8a012d43`,
snapshot sha256 `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`).

## How it was run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
node check-gate.mjs out
```

Node v24.22.1 locally (the grader runs Node 22.23.4; main.ts uses only
erasable TypeScript and the Node standard library, as the starter does).
Screenshots were taken with Google Chrome 158 headless at 1440x900 from
the built `out/dashboard/` — the board, the detail view of the rank-1
protocol (Steakhouse Financial), and the board filtered to Risk Curators
with watchlist-only on. Each screenshot was visually inspected.

## Results (after the bubble map + pagination revision, 2026-11-23)

```
token radar: 758 protocols, 40 on the watchlist, 198 rows scored
             (158 below the floor, 24 live set aside)
token radar: top row Steakhouse Financial at $545,001,445,
             total implied $4,125,463,455
```

Local gate replication (`node check-gate.mjs out`) — 7 passed, 0 failed:

| Gate row | Result |
| --- | --- |
| dashboard_files | PASS — 3 files, 47,132 bytes, html=true css=true js=true network-in-attr=false |
| board_file | PASS — 198 rows, every slug in the snapshot, all fields valid |
| sorted_by_value | PASS — ranks exactly 1..198, implied value non-increasing, not flat (198 distinct values) |
| coverage | PASS — watchlist 40/40, missing 0 |
| farm_steps | PASS — 198 rows x 7 steps, each 99–240 characters |
| screenshots | PASS — 3 PNGs, 1440x900, 233,100 / 153,463 / 100,992 bytes (cap 512 KiB each) |
| dossier_matches | PASS — dossier.json 698,893 bytes, byte-identical to what `buildDossier` writes |

### What changed in this revision (dashboard only — model and board untouched)

Bubble map + pagination, at the user's direction (final revision before
submit; visual reference Bubblemaps v2 — its data and assets were not
used, only the idea of a bubble map):

- **Added — Radar map:** one bubble per protocol on the board (198),
  drawn as inline SVG from `data.js` (no library, no network). Bubble
  area follows implied value on a square-root scale (`5 + 45 ×
  √(implied/max)`), so the smallest bubble is still visible and clickable;
  colour follows category (12-colour palette, deterministic by category
  name) with a legend naming every category on the filtered board and its
  count; watchlist rows carry an amber ring (40 rings). The layout is a
  deterministic spiral pack — largest bubbles first at the centre, ties
  broken by slug, sampling grid rotated per radius so bubbles do not line
  up on spokes, no unseeded randomness — so two fresh page loads place
  every bubble at identical coordinates (verified). The map follows the
  same search/category/watchlist filters as the table (Risk Curators +
  watchlist-only: 12 bubbles). Labels inside the largest bubbles only.
- **Added — Pagination:** 20 rows per page (198 rows = 10 pages; Live
  tab 24 rows = 2 pages). Previous / numbered pages with ellipsis /
  Next, "Showing 1–20 of 198 rows", `aria-current="page"` on the active
  page. Changing page keeps sorting and filters and moves focus to the
  top of the table; changing a sort, filter, search or tab returns to
  page 1.
- **Accessibility kept/intact:** every bubble is a focusable button
  (`role="button"`, `tabindex="0"`, `aria-label` with name, rank, implied
  value, category, watchlist) — click or Enter opens that protocol's
  detail, and closing the detail returns focus to the same bubble (a
  detail opened from the table still returns focus to the protocol's name
  button). Hover/focus updates a polite `aria-live` readout line under
  the map. The table stays the fully accessible alternative to the map.
  Focus-visible is a white ring on the bubble; contrast stays WCAG AA.
- **Kept:** title + lede, the 4 summary cards, search, category +
  watchlist filters, Pre-token/Live tabs, the sortable ranking table,
  and the protocol detail with worked equation + 7-step farm plan.
  Compare and the category-distribution panel stay removed.
- **Interactive checks (headless Chromium, no console errors):** at
  390/768/1440px — no page-level horizontal overflow, no overflowing
  element, no truncated text; bubble layout identical across two fresh
  loads; a search keystroke re-renders in ~30 ms; clicking the Gauntlet
  bubble opens Gauntlet's detail (7 farm steps, focus on it); Enter on
  the Veda bubble opens Veda's detail and closing returns focus to the
  Veda bubble; page 1 shows 20 rows ("Showing 1–20 of 198 rows"), Next
  goes to 21–40 with focus on the table top, page 10 shows 18 rows
  (181–198); filtering to Risk Curators resets to page 1 (34 rows, 34
  bubbles); sorting by TVL resets to page 1 (Sentora Curator $2.76B
  first); search "gauntlet" narrows board and map to 1 row/bubble and
  keeps search focus; Clear filters restores 198 rows and 198 bubbles;
  Live tab paginates 24 rows over 2 pages and shows no map; hover on the
  Steakhouse Financial bubble reads out its rank and $545.0M value.
- **Caps:** dashboard source 47,132 bytes (cap 65,536 for the dossier
  text); `board.json` 317,168 bytes (cap 8 MiB); `dossier.json` 698,893
  bytes (cap 1.5 MiB); screenshots 233,100 / 153,463 / 100,992 bytes
  (cap 512 KiB each). No new numbers were invented: every figure above
  comes from the snapshot/board.

Determinism: the program was run twice into two directories and
`diff -r` reported them byte-identical, as the grader requires (re-run
after this revision; `board.json` and `dossier.json` sha256 identical
across both runs). Screenshots were retaken after this revision with
headless Chromium at 1440x900 and visually inspected (bubble map +
board page 1, detail of Steakhouse Financial, Risk Curators +
watchlist-only filtered view with its 12-bubble map).

### What changed in the earlier simplification (dashboard only — model and board untouched)

Simplification, at the user's direction: the dashboard was getting hard to
read, so features were removed rather than added.

- **Removed:** the two-protocol comparison (row Compare buttons, detail "Add to compare", 12-metric side-by-side panel) and the per-category distribution panel (top 8 categories + bars) — both were the heaviest things on the page and neither helped a judge decide in the first 10 seconds. Also removed: the peer-multiple table and the long model panel, replaced by one short "How to read this board" note (formula in one line, what the peer multiple is, what is kept off the board); the repeated disclaimer paragraph in the footer.
- **Kept:** title + lede, the 4 summary cards, search, category + watchlist filters, Pre-token/Live tabs, the sortable ranking table (now 8 columns), and the protocol detail with worked equation + 7-step farm plan.
- **Engineering fixes kept from the review pass:** `--faint` text lightened from #5c6b7d (3.24:1, failed WCAG AA) to #7e8ea0 (5.26:1 on the panel); the search box no longer loses focus after the first typed character (focus + caret are preserved across re-renders — before, typing "gauntlet" only entered "g"); the Live tab now honours the same search and category filters (before, a search there changed nothing: 24 rows either way); sort headers carry `aria-sort`; the protocol name is a real button into the detail view (rows are no longer focusable tab stops containing a button); opening a detail moves keyboard focus to it, closing returns focus to that protocol's name; the result count is an `aria-live` status; the table wrapper is `tabindex="-1"` so it is not an extra tab stop; a clear error state if `data.js` fails to load. The distribution panel's mobile overflow (6px over at 768px, "Onchain Capital Allocator" truncated at 390px) is gone with the panel itself.
- **Interactive checks (headless Chromium, no console errors):** at 390/768/1440px — no page-level horizontal overflow, no overflowing element, no truncated text; typing "gauntlet" keeps focus and shows 1 row; a nonsense search shows the empty state naming the active filters; Clear filters restores 198 rows and focus to the search box; sorting by TVL puts Sentora Curator ($2.76B TVL) first; detail opens with focus on it and recomputes $536.6M, matching board.json; closing returns focus to that protocol; Live-tab search "solana" filters 24 → 3 rows; tab order from the skip link is search → category → watchlist → tabs → sort headers.
- **Database:** none — by design. The dashboard stays static; `board.json` and `data.js` are both written by `main.ts` from the same board and were verified in sync (198 rows, identical slugs, implied values and farm plans).
- **Caps (at the time of that revision):** dashboard source 35,264 bytes (cap 65,536 for the dossier text); `board.json` 317,168 bytes (cap 8 MiB); `dossier.json` 684,005 bytes (cap 1.5 MiB); screenshots 164,284 / 153,448 / 167,732 bytes (cap 512 KiB each). No new numbers were invented: every figure above comes from the snapshot/board.

Determinism: the program was run twice into two directories and
`diff -r` reported them byte-identical, as the grader requires (re-run
after the bubble-map revision; `board.json` and `dossier.json` sha256
identical across both runs). Screenshots were retaken after the
simplification with headless Chromium at 1440x900 and visually inspected
(board, detail of Steakhouse Financial, Risk Curators + watchlist-only
filtered view).

Exclusion spot-checks (the trap the starter falls into): WBTC, Binance
staked ETH, USDT0, Coinbase Bridge, Binance Bitcoin and Base Bridge are
all absent from the board; no row is in a Bridge / Liquid Staking / CEX
category and no row's name carries "wrapped", "staked" or "staking".

Dashboard source is 47,132 bytes in total, so the dossier's 65,536-byte
text cap holds the whole dashboard source — the judge reads it in full.
`board.json` is 317,168 bytes (cap 8 MiB); `dossier.json` is 698,893
bytes (cap 1.5 MiB).

## What was NOT graded

There is **no local grade** for this bounty — the scorer and the judge
live on make.fun's server. The only grade that counts is the server's
dev grade after submission, which also runs the transcript gate and
12–20 judge games against the house dashboards. Nothing here predicts
a rank or a prize: 27,967 entries were already submitted at build time
and only the top 10 are paid.

The kit's pre-submit check (`node cli/makefun.mjs check --kit . --repo
<repo> --transcripts transcripts.tar.gz`) was **not** run: it needs a
public GitHub repository and a transcripts bundle, neither of which
exists yet (see below).

## Still missing for a real submission

1. **A public GitHub repository** created after 2026-11-14 holding
   this entry at one commit, with an OSI-approved license (MIT is
   included) and `.makefun/owner.json` unless the repo owner is the
   account's GitHub login. The make.fun account is already connected
   (agent keypair linked to @sri-wulandari, 2026-11-23, key good until
   2026-12-23); the user uploads the repository manually.
2. **Transcripts of the agent sessions that built the entry.** The
   sessions exist on disk as Muse app sessions and the kit's
   `bundle --dry-run` finds 18 of them (root session, 236 turns; the
   UI/UX upgrade subagent, 60 turns; the preview builder). A real
   bundle still needs the `--muse-usage` rows for those sessions and
   the harness flags (`--harness muse-app --provider meta --model
   muse-spark-1.3 --effort default --mcp none`). A handed-over session
   file would be graded but takes **no paid place** under this bounty,
   so it is not a shortcut to a prize.
3. **Submission itself** — not done. At most 5
   submissions a day, 10 in all; the last before the deadline counts.
