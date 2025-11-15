You are an expert level backend API developer, database modeler, and systems engineer, with a specialization in Nx + Node/Express + Prisma stack.

# Backend Congress Sync (Basic)

## Objective

Implement the **Phase 1 Backend Congress Sync** described in `PROJECT_OVERVIEW_AND_ROADMAP.md`. With the Congress.gov API client already in place (`src/app/services/congress/**`), this task wires up a repeatable ingestion pipeline that stores bill data inside `civiclens-api/`, keeps it fresh via a cron-style job, and exposes read-friendly endpoints that the existing RealWorld-based clients can consume (web work can follow later).

## Repository & Runtime Context

- Workspace: `civiclens-api/` (Nx + Express + Prisma, Node 18).
- Prisma schema currently models RealWorld entities (`Article`, `Tag`, `User`, `Comment`). We will extend/reshape it to store Congressional data.
- Tests run via `npm test` → `nx test`, Jest + TS.
- Existing Congress API integration prompt: `docs/congress_api_agent_prompt.md` (assume delivered).
- `.env` already holds `CONGRESS_API_KEY`; add new sync-specific env vars as needed.

## Deliverables

1. **Database schema for bills, actions, subjects, sponsors, and sync metadata** plus migrations + seed fixtures.
2. **Sync engine** that fetches recent bills from Congress.gov, upserts them, and records progress.
3. **Scheduling/triggering layer** (cron + manual CLI) with logging/metrics hooks.
4. **REST endpoints** that surface the synced bills (either via new `/api/bills` routes or by adapting the RealWorld article endpoints to emit bill-shaped data).
5. **Comprehensive automated tests** (unit + integration) covering schema utilities, sync logic, schedulers, and controllers.
6. **Documentation updates** (README + docs) that explain configuration, sync invocation, and API usage.

## Detailed Requirements

### 1. Data Modeling & Prisma Migration

Create/modify Prisma models under `src/prisma/schema.prisma` to represent Phase‑1 data:

- `Bill`
  - `id` (Int autoincrement) for internal refs.
  - `slug` (string: `congress-billType-billNumber`, unique) so web can link.
  - `congress` (Int), `billType` (enum: HR, S, HRES, etc), `number` (Int).
  - `title`, `officialTitle`, `introducedAt`, `latestActionAt`.
  - `currentStatusCode`, `currentStatusText`, `policyArea`.
  - `sponsorMemberId` (FK to `Member`), `cosponsorsCount`.
  - `summaryShort`, `summaryLong`, `sourceUrl`, `lastSyncedAt`.
- `BillAction`
  - `id`, `billId`, `actedAt`, `actionCode`, `chamber`, `description`.
  - Index by `billId, actedAt desc`.
- `BillSubject`
  - `id`, `billId`, `value` (unique per pair). Optionally map to existing `Tag`.
- `Member`
  - `id` (string from API), `bioguideId`, `firstName`, `lastName`, `party`, `state`, `chamber`.
  - Timestamps to track updates.
- `BillSyncCursor`
  - Single-row table storing `lastSuccessfulSync` (ISO timestamp) + `windowDays`.

Preserve the legacy `Article`/`Tag` tables for now so existing endpoints/tests keep passing. However, add views in Prisma (or service-level mappers) so we can emit "article-like" payloads derived from `Bill`.

Actions:
1. Update schema with new models + enums + indexes.
2. Run `npx prisma migrate dev --name add_bill_models` (doc the command; do not commit generated DB files).
3. Update `prisma/seed.ts` to optionally create a small set of bill fixtures (use static JSON under `src/tests/fixtures/congress/seed-bills.json`).

### 2. Congress Sync Service

Implement a dedicated module: `src/app/services/congress-sync/`.

**Structure suggestion:**

- `congress-sync.config.ts` → reads env vars:
  - `CONGRESS_SYNC_WINDOW_DAYS` (default 14).
  - `CONGRESS_SYNC_PAGE_SIZE` (default 20).
  - `CONGRESS_SYNC_CRON` (default `0 * * * *` for hourly).
  - `CONGRESS_SYNC_ENABLED` (boolean).
- `congress-sync.mapper.ts` → converts Congress API responses into Prisma-ready objects (Bills, Members, Actions, Subjects). Reuse the typed client from `src/app/services/congress`.
- `congress-sync.repository.ts` → wraps Prisma writes/upserts (batch operations, transactions, concurrency guard).
- `congress-sync.service.ts` → orchestrates the pipeline:
  1. Determine `startDate` based on `BillSyncCursor` (fallback to `windowDays`).
  2. Pull paginated bill summaries from `CongressApi.bills.listBills`.
  3. For each bill, fetch detail endpoint (for actions/subjects/summaries).
  4. Upsert Member → Bill → related entities in a single transaction.
  5. Record `lastSuccessfulSync`.
  6. Emit structured logs (e.g., `console.info('[congress-sync] upserted', { slug, status })`).
- Add simple exponential backoff for 429/5xx responses (max 3 retries) using the helper added in the previous task.

**Manual run support:** create `src/scripts/run-congress-sync.ts` that bootstraps the app config, instantiates `CongressSyncService`, and runs one pass. Add an Nx target (e.g., `"sync:congress": "nx run api:sync-congress"`) mapping to that script so ops can run `npm run sync:congress`.

### 3. Scheduling & Observability

- Add `node-cron` (or `cron`) dependency and wire it inside `src/main.ts` (guarded by `CONGRESS_SYNC_ENABLED`).
- Scheduler should:
  - Instantiate `CongressSyncService`.
  - Run immediately on boot (optional) and then per cron expression.
  - Catch/report errors without crashing the server; failed runs should not update the cursor.
- Add lightweight metrics/logging hooks:
  - Expose latest sync status via `/api/health/congress-sync` (timestamp, duration, counts).
  - Emit structured logs for start/end/error.

### 4. API Surface / Routes

Create new Express routes under `src/app/routes/bill/` (controller + service) that expose the synced data:

- `GET /api/bills`
  - Query params: `cursor`, `limit`, `status`, `topic`, `congress`, `chamber`.
  - Returns RealWorld-style `articles` array (for compatibility) but each entry backed by a `Bill`. Include additional bill-specific fields in a `bill` object to ease future frontend work.
- `GET /api/bills/:slug`
  - Returns bill detail with summary, subjects, actions, sponsor info.
- `GET /api/bills/:slug/actions`
  - Optional convenience endpoint if the detail payload gets large.

Modify `routes.ts` to include the new controller. The existing `Article` routes can remain for now, but document that `/api/bills` is the canonical feed going forward.

If time allows, update the `/api/tags` route to include distinct subjects/topics pulled from the new `BillSubject` table so the frontend tag UI can show policy areas without additional work.

### 5. Testing Strategy

Add Jest coverage under `src/tests/congress-sync/`:

1. **Mapper tests**: Given raw Congress API fixtures (store under `src/tests/fixtures/congress/`), verify `Bill`, `Member`, `Action`, `Subject` transforms.
2. **Repository tests**: Use Prisma test client pointed at SQLite (configure `DATABASE_URL="file:./tmp/test.db"` during Jest). Ensure upserts handle inserts + updates and maintain referential integrity.
3. **Service tests**: Use `nock` or `axios-mock-adapter` to stub Congress API responses and assert pagination, retry-on-429, cursor updates, and error handling.
4. **Scheduler tests**: Mock `node-cron` to confirm it registers jobs and swallows errors appropriately.
5. **Route tests**: Add supertest-based specs under `src/tests/routes/bills.controller.test.ts` covering list + detail responses (mock Prisma layer).

Update `jest.config.ts` if needed to include the new test folders/mocks. Ensure `npm run test` passes locally.

### 6. Documentation & Developer Experience

- Update `civiclens-api/README.md`:
  - Mention new env vars (`CONGRESS_SYNC_*`).
  - Document how to run the manual sync script.
  - Add a short section on the `/api/bills` endpoints.
- Add a short doc (`docs/congress_sync_operative_notes.md`) or enrich this prompt with a “runbook” snippet explaining:
  - Expected cron cadence.
  - How to inspect the latest sync status.
  - How to reset/reseed data in dev environments.

## Acceptance Criteria

- Prisma migration introducing bill/member/action tables is committed; `npx prisma migrate deploy` succeeds.
- `npm run sync:congress` completes a single ingest cycle, persisting at least the last 14 days of bills (configurable).
- Cron-based sync respects `CONGRESS_SYNC_ENABLED=false` (no jobs scheduled) and logs success/failure when enabled.
- `/api/bills` and `/api/bills/:slug` return data sourced from the new tables, formatted per spec.
- Comprehensive Jest coverage for mapper/repository/service/scheduler/routes; CI passes with `npm test`.
- Documentation reflects new env vars, commands, and API surface.

## References

- Roadmap: `PROJECT_OVERVIEW_AND_ROADMAP.md` → Phase 1 / Backend Congress sync.
- Existing Congress API client prompt: `docs/congress_api_agent_prompt.md`.
- Web client context: `civiclens-web/README.md` (understand expected feed + tag endpoints).
