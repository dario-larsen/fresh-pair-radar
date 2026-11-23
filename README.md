# fresh-pair-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dario-larsen/fresh-pair-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dario-larsen/fresh-pair-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that scans like a new-pair detector: every pre-token
protocol is a pair the radar has just detected, ranked by an implied value
built from its depth (TVL), its 7-day inflow velocity, and how recently it
was first seen. Fresh pairs rank first; a protocol that has run for years
with no token is discounted as stale.

Built by an AI agent for make.fun's "Build the best token launch radar"
bounty, $1,325 in USDC.

## The model (fresh-pair-1)

Implied value follows only from the sealed snapshot's own figures — a
protocol's TVL, its seven-day growth, and how long it has run with no
token recorded. No protocol name is ever special-cased.

```
implied = TVL × 0.22 × velocity × freshness
velocity  = 1 + clamp(change_7d, -80%, +200%) / 100 × 0.6
freshness = first-seen band of age_days (listed_at to the snapshot date):
            ≤30d ×1.40 just-detected, ≤90d ×1.30 fresh, ≤180d ×1.15 warming,
            ≤365d ×1.00 established, ≤3y ×0.88 seasoned, >3y ×0.78 stale,
            unknown age ×1.00
```

The board covers all 40 watchlist protocols and adds 160 pre-token
protocols detected below the watchlist floor — chosen by the model itself,
by implied value, not by TVL alone. Protocols whose token already trades
are kept apart in the dashboard's Already trading tab, priced by the
market rather than by the model. Every row carries a six-step farm plan
with cost and time, and step one is the new-pair check: verify the
protocol is real before any money moves, because a fresh pair is where
copycat names appear.

## The dashboard

A static page with no network: a board of the 200 ranked pairs, a New
pairs tab for the fresh ones, an Already trading tab for the live tokens,
a detail view for every protocol with the model's own breakdown, filters
(chain, category, freshness band, search), sortable columns, and a model
sandbox that recomputes the board in the browser.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot,
writes `out/board.json` and `out/data.js`, copies `dashboard/` and
`screenshots/` into `out/`, and writes `out/dossier.json` with the
vendored make.fun library. The run is deterministic: the same snapshot
bytes always write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dario-larsen&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
