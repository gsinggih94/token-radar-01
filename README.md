# Token Radar — radar-2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/swulandary249/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/swulandary249/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun bounty `token-radar-01` — "Build the best token launch radar".
Pot $1,325 USDC, 10 places paid, deadline Mon 14 Dec 2026 10:00 UTC.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama
snapshot at `/input/snapshot.json`, scores every pre-token protocol with
the peer-multiple model in `lib/model.ts`, and writes:

- `board.json` — 198 ranked rows (the 40-protocol watchlist, plus 158
  further pre-token protocols below the $50,000,000 floor), each with an
  implied value and a 7-step farm plan
- `data.js` — the same board for the dashboard
- `dashboard/` — a static page that renders with no network
- `screenshots/` — board, detail view, filtered view
- `dossier.json` — built with `vendor/makefun-board.ts` from the kit

## The model (radar-2)

```
implied = round(tvl_usd x peer multiple
                x (1 + clamp(change_7d, -50, +100) / 100 x 0.4)
                x (0.70 + 0.30 x min(age_days, 1460) / 1460))
```

The peer multiple is the median market-cap / TVL of the live-token
protocols in the same category (at least 3 live peers), shrunk toward the
global median (0.241) and capped at 1.5x. Categories with too few live
peers use the global median. Age is the time since DefiLlama first listed
the protocol; an unlisted age uses 365 days.

A protocol is ranked only if it records no token **and** is not a wrapped,
staked or bridged product of a token that already trades — the watchlist's
own test, applied to every row. That is what keeps WBTC, Binance staked
ETH and USDT0 off the board. Live-token protocols are set aside on their
own tab, with market caps shown as facts.

## What the dashboard does

Kept deliberately small, so a judge reads it in seconds:

- **Radar map** — a Bubblemaps-style bubble map above the table: one bubble per protocol on the board, sized by implied value on a square-root scale (so small bubbles stay visible), coloured by category with a legend, amber ring for watchlist rows. The layout is a deterministic spiral pack — same data, same positions every run, so screenshots reproduce. Hover or focus a bubble to read its name, rank and implied value; click it (keyboard: Enter) to open the same protocol detail as the table.
- **Sortable, paginated board** — click any column header to sort by rank, name, TVL, 7-day change, age, peer multiple or implied value (ascending/descending, with a visible ▲/▼ indicator and `aria-sort`); the sticky header stays visible while scrolling. 20 rows per page (198 rows = 10 pages) with Previous / page numbers / Next, "Showing 1–20 of 198 rows", and `aria-current` on the active page. Changing page keeps sorting and filters; changing a sort, filter or search returns to page 1, and focus moves back to the top of the table.
- **Search + filters** — search by name, slug, category or chain; filter by category; watchlist-only; Pre-token / Live-token tabs (the Live tab honours the same search and category filters, and is paginated too: 24 rows = 2 pages). The bubble map follows the same filters as the table. A Clear filters button appears whenever a filter is active, and an empty result states exactly which filters are active.
- **Protocol detail** — click a protocol name (keyboard: Tab to it, Enter) for the full model breakdown, a worked arithmetic line (`TVL × peer × growth × maturity = implied`), the listing date, chain count, how many live peers priced the category, a plain-language note on why it ranks where it does, and the 7-step farm plan.
- **How to read the board** — one short note under the table: the formula in one line, what the peer multiple is, and what is kept off the board. Everything is client-side, from the data already in `data.js`; there is no network, no framework, no external package.

Removed in the 2026-11-23 simplification (they made the page harder to read in the first 10 seconds): the two-protocol comparison and the per-category distribution panel, plus the peer-multiple table.

## Data — no external database

There is no server and no external database: the kit forbids them, because the dashboard must render with no network. The single source of truth is the snapshot; `main.ts` writes the same board twice — once as `board.json` (the graded artefact) and once as `data.js` (`window.RADAR`, the dashboard's data). After this revision both were verified in sync: 198 rows, every slug and implied value identical, every farm plan identical.

Top row on the sealed snapshot: Steakhouse Financial, implied
$545,001,445. Total implied value across the board: $4,125,463,455.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

There is no local grade for this bounty: the server grades every entry.
Verify locally with the gate-shaped checks in `check-gate.mjs`
(see below), and run the program twice and compare the outputs —
both runs must write the same bytes.

```sh
node check-gate.mjs out
```

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Entrypoint: snapshot in, board + dashboard + dossier out |
| `lib/model.ts` | The radar-2 model, farm plans, snapshot parsing |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied from the kit unchanged |
| `dashboard/index.html`, `app.css`, `app.js` | The static dashboard (no network) |
| `screenshots/1-board.png` | The bubble map + the board, page 1 |
| `screenshots/2-detail.png` | A protocol's detail view (Steakhouse Financial) |
| `screenshots/3-filtered.png` | The board filtered to Risk Curators, watchlist only |
| `LICENSE` | MIT |

## Status

Built locally and gate-checked (see `GRADE.md`). **Not submitted.**
The make.fun account is connected (agent keypair linked to
@sri-wulandari, 2026-11-23). Submitting still needs: a public GitHub
repository created after 2026-11-14 (the user uploads it manually),
and the transcripts of the agent sessions that built this entry
bundled with the kit's `bundle` command.
