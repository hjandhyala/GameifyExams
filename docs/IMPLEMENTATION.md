# Implementation notes (v1)

This file maps [`LLD.md`](LLD.md) to the code and lists where the build deliberately differs from the design. Status checked on 2026-11-18:
- `npm run typecheck` is clean.
- 114 unit and integration tests pass.
- 12/12 Playwright tests pass on desktop Chrome and on Pixel 7 emulation.
- The 11 player tests also pass against the production build with the strict CSP.
- The production `next build` succeeds.

## LLD → code map

| LLD | Where |
|---|---|
| §4.1 catalog, §3.5 difficulty ramp | `packages/core/src/catalog.ts` |
| §5 engines (evaluate, share, invariants, compile) | `packages/core/src/engines/*` |
| §5.5.3 Verdict solver + generator | `packages/core/src/logic/solver.ts` |
| §8.4 dates, §8.6 streaks, §9.2 date window | `packages/core/src/{date,streaks}.ts` |
| §6 UI system, tokens, motion, a11y | `apps/web/src/styles/globals.css`, `apps/web/src/components/**` |
| §8 client (store, persistence, outbox, restore, rollover) | `apps/web/src/client/*` |
| §9 API (all endpoints, error envelope, rate limits, caching) | `apps/web/src/app/api/**`, `apps/web/src/server/*` |
| §9.1 device cookie, §14.2 CSP nonce | `apps/web/src/proxy.ts` |
| §10 data model | `packages/db/src/{schema,migrations}.ts` |
| §11 sources, §11.5 knowledge store | `packages/content/src/sources.ts`, `packages/pipeline/src/ingest/*` |
| §12 pipeline (plan, generate, collect, validate V1–V8, schedule, compile, psychometrics, golden eval) | `packages/pipeline/src/**`, CLI `npm run pipeline -- help` |
| §13 admin console (review + live preview, schedule/swap, patch/void/pull, reports, psychometrics, vocab, runs/audit, staff) | `apps/web/src/app/admin/**` |
| §15.4 cron jobs | `apps/web/src/server/cron.ts`, `apps/web/vercel.json` |
| §17 tests | `packages/*/test`, `apps/web/test`, `e2e/` |
| §18 CI/CD | `.github/workflows/*` |

## Deliberate deviations

| LLD said | Implemented | Why |
|---|---|---|
| pnpm workspaces | npm workspaces | pnpm is not installed here; behavior is equivalent |
| Docker Postgres or a Neon branch for local dev and tests | **Embedded PGlite** when `DATABASE_URL` is unset (`node_modules/.cache/prepdle-pglite`) | Zero-setup development; tests run real SQL with no Docker. Production uses Postgres via `DATABASE_URL`. |
| drizzle-kit generated migrations | Hand-written SQL in `packages/db/src/migrations.ts` with a tiny migrator | Bundles into serverless functions; one source of truth |
| `items.public` / `items.secret` columns | `items.content` (authored JSON) + `items.game_id` | Authored items are compiled per puzzle. Classify needs `game_id` to tell Anatomy from Verdict. |
| `/api/admin/*` REST routes | Next.js Server Actions (`app/admin/actions.ts`) | Less code. Same role checks and audit log. |
| TanStack Query | `fetch` with retry/backoff (`client/api.ts`) | Small surface. Keeps the player bundle smaller. |
| Serwist | Hand-written `public/sw.js` | Serwist doesn't fit Turbopack builds cleanly. The caching rules match §6.9. |
| Upstash required | Upstash optional. In-memory sliding window per instance otherwise. | Local dev without services |

## Not yet done (honest gaps)

- **Content volume.** The bank has 58 hand-written fixture items, which are illustrative and still need expert review, not the ≥ 45-day launch bank. Vocabularies hold 361 entries against the target of about 2,900, and domain word lists are small. Producing the bank uses the pipeline plus human review (LLD §12.11).
- **Live LLM runs.** Generation and LLM validators (V3/V4/V5/V7) are implemented and typecheck, but they were **not run against the API** because each run spends money. Run `npm run pipeline -- generate … --n 3` once you approve the spend.
- **External ingest jobs** are implemented (Clinical Tables, MeSH lookup, RxClass, openFDA, PubChem, Wikidata, CourtListener, generic URL) but were not executed here. MeSH uses the per-term lookup API rather than the bulk file. OpenStax goes through the generic `ingest url`.
- **Phase 6 items:** share images, Web Push reminders, streak shield, archive UI. The flag exists, but there is no UI.
- Sentry is not installed (the CSP allows it). There is no ESLint/Prettier config, no k6 load test and no visual-regression snapshots.
- WebKit and Firefox E2E projects are opt-in (`E2E_ALL_BROWSERS=1`). Only Chromium is installed here.
