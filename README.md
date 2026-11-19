# GameifyExams · Prepdle

Daily, shareable puzzle games for standardized-exam prep: **MCAT · LSAT · USMLE Boards · Bar**.
One puzzle per game per day, the same for everyone, no account needed. The design is in [`docs/LLD.md`](docs/LLD.md). [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) maps the LLD to the code and lists deviations.

| | MCAT | LSAT | Boards | Bar |
|---|---|---|---|---|
| Quartet (grouping) | ✅ | ✅ | ✅ | ✅ |
| Jargon (word) | ✅ | | ✅ | ✅ |
| Workup (progressive reveal) | Specimen | | Workup | Doctrine |
| Classify | | Anatomy · Verdict | | |
| Gauntlet (5 MCQs + confidence) | ✅ | ✅ | ✅ | ✅ |

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000. Uses embedded Postgres (PGlite) and seeds fixture puzzles automatically
```

No Docker or database setup is needed for development. With fixtures enabled (any non-production run), the server seeds the reviewed fixture bank and schedules it around today. Append `?__date=YYYY-MM-DD` to preview another day (dev only).

Staff console: `http://localhost:3000/admin` (dev sign-in with any email; the first user becomes admin).

## Tests

```bash
npm test               # unit + integration (core engines, streaks, solver, fixtures, PGlite DB, scheduler, autocomplete)
npm run typecheck
npx playwright install chromium && npm run e2e   # plays every game in Chrome + Pixel 7 emulation, axe checks, admin flow
```

## Repository layout

```
apps/web            Next.js 16 app: player UI, REST API (/api/v1), cron routes, staff admin console
packages/core       pure TS: engines (evaluate/share/invariants), catalog, dates, streaks, logic solver
packages/db         Drizzle schema, SQL migrations, repository (Postgres or PGlite)
packages/content    blueprints, vocabularies, word lists, reference tables, fixture items, generated assets
packages/pipeline   content pipeline CLI: ingest → generate (Claude) → validate → schedule/compile
e2e                 Playwright specs
docs                LLD, implementation notes
```

## Content pipeline

```bash
npm run pipeline -- help
npm run pipeline -- ingest sources && npm run pipeline -- ingest openfda       # external open data → kb.*
npm run pipeline -- plan --weeks 6                                             # bank vs demand
npm run pipeline -- generate --track boards --game gauntlet --n 20 --batch     # Claude drafts (Batch API)
npm run pipeline -- collect --run <id> && npm run pipeline -- validate         # V1–V8 → review queue
npm run pipeline -- schedule --days 28                                         # approved items → dated puzzles
npm run pipeline -- build-assets                                               # after editing vocab/word lists
```

`ANTHROPIC_API_KEY` (or an `ant auth login` profile) is needed for `generate` and the LLM validators. Each run's spend is recorded and shown with `npm run pipeline -- cost`.

## Deploying (Vercel + Neon + optional Upstash)

1. Create a Neon database and set `DATABASE_URL`. Then run `npm run db:migrate` and `npm run db:seed` (or generate and review real content).
2. Set the secrets from [`.env.example`](.env.example) (`DEVICE_PEPPER`, `TRANSFER_KEY`, `REDIS_SECRET_KEY`, `CRON_SECRET`, `AUTH_*`, `ADMIN_EMAILS`, `LAUNCH_DATE`).
3. Deploy `apps/web` (root directory) to Vercel. `apps/web/vercel.json` registers the cron jobs.
4. The GitHub Actions workflows in `.github/workflows` run CI, weekly generation and nightly scheduling (they need `DATABASE_URL` and `ANTHROPIC_API_KEY` secrets).

Educational use only. Not medical or legal advice. Not affiliated with AAMC, LSAC, FSMB, NBME or NCBE.
