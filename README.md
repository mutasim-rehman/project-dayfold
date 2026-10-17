# Dayfold

A React/Node.js personal daily newspaper MVP, with English and Urdu reading, Supabase accounts/data, and Google Agent Platform integration. The application is implemented locally; deployment and live-service readiness are separate gates.

## Run locally

Use a supported Node.js release (22 or newer) and pnpm. Dependencies are pinned in `package.json` and `pnpm-lock.yaml`.

```sh
pnpm install --ignore-scripts
pnpm dev
```

Open http://localhost:3000. The open edition fetches attributed publisher excerpts without requiring an account. Source coverage is deliberately limited to eligible original Global Voices text.

Copy variable names from `.env.example` into local `.env` and set values locally. Never commit credentials, paste them into chat, or prefix private keys with `NEXT_PUBLIC_`. Existing `Google_Service_Account_JSON` is supported as a server-side alias for `GOOGLE_SERVICE_ACCOUNT_JSON`; no credential values have been copied into this repository's documentation.

## Supabase setup

1. Review and apply `supabase/migrations/202610170001_initial.sql` in the intended project. It creates new application tables, RLS policies, service-only job/memory functions, and private PDF storage in a transaction.
2. If using the CLI migration helper, `DATABASE_URL` must resolve from this computer. A Supabase **session pooler** connection is suitable when the direct database host requires unavailable IPv6 connectivity. Preserve SSL verification.
3. `node scripts/migrate.mjs` refuses to apply if it finds conflicting application tables. Review conflicts; do not drop an existing schema to force the script through.
4. Enable Google in Supabase Auth. Configure a Google OAuth **web application** client ID/secret, consent audience, Supabase callback URI, and exact local/production redirect URLs. Google service accounts and model API keys do not supply browser OAuth credentials.
5. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in the deployment.

Anonymous users cannot read private records. Authenticated users can read only their own editions, memories, conversations, jobs, and events. Server routes derive identity from `getUser()`, check ownership, and isolate privileged writes. Do not expose service-only SQL functions or worker secrets to the browser.

The Supabase plugin was reported added by the user and confirmed installed in the plugin directory. Its SQL tools were not exposed in this execution's callable tool list, so no plugin migration is claimed here.

## Model setup

Use `GOOGLE_CLOUD_API_KEY` (existing alias `Google_Agent_Platform_Key` is supported) for Agent Platform express-mode access, or valid service-account JSON with an authorized cloud project. An explicit platform key takes precedence over legacy service-account configuration. The app does not silently switch to the separate Gemini Developer API.

- `LLM_SYNTHESIS_MODEL`: configurable synthesis model; initial candidate `gemini-3.8-flash`.
- `LLM_EXTRACTION_MODEL`: configurable structured extraction model; initial candidate `gemini-3.7-flash`.
- `GOOGLE_EMBEDDING_MODEL`: configurable embedding endpoint; initial candidate `gemini-embedding-001`, 768 output dimensions.

These are configured candidates, not assertions of project access, distinct routing, or production language quality. Validate all three against the actual account. `node scripts/check-services.mjs --model` makes one small synthesis request and prints only safe capability booleans/error categories; `--model` may consume credits. Embedding connectivity requires a separate check.

If model access fails, English editions can use labeled publisher excerpts. Urdu edition generation fails visibly rather than presenting English as translated output. Ask does not invent an answer during provider failure. Semantic retrieval can fall back to explicit preferences with a visible reason.

Conversation extraction creates **proposals**, not automatic accepted memories, in this implementation. Readers accept or forget them in Preferences. This is a deliberate conservative difference from the longer-term auto-save option in the specification. Forgotten keys remain tombstones to prevent replay resurrection. Accepted memories affect subsequent retrieval/ranking only when conversational memory is enabled.

## Durable background work

The initial implementation uses a PostgreSQL job table with transactional enqueue, leases, `FOR UPDATE SKIP LOCKED`, retry state, and idempotency keys. This is the implemented durable-queue mechanism; pgmq was a planning candidate and is not required by this migration.

- Edition/PDF/memory requests can invoke a worker through Next.js `after()` for a fast first attempt.
- Configure a recurring authenticated HTTP dispatch to `POST /api/internal/worker` for recovery, delayed retries, and morning scheduling. Without dispatch, closing a server process can leave pending work until the next invocation.
- Protect it with `Authorization: Bearer <WORKER_SECRET>`. Store the dispatch secret in Supabase Vault or protected scheduler configuration, not in tracked SQL or browser code.
- Supabase Cron can make the dispatch via supported HTTP functionality. Configure this through the project dashboard with actual project/endpoint settings. Do not disable token checking to make cron work.
- The worker enqueues missing editions for recently active readers after 07:00 in their saved timezone. The time is currently fixed; a reader-selected hour is still pending.
- Embedding batches are separate jobs so model indexing cannot block the first readable paper. Small batch size and duration limits still need deployed-load validation.

Vercel Hobby cron is not the five-minute dispatcher. Verify actual plan limits, commercial eligibility, quotas, and account credits before enabling a public startup release. No paid plan or billing change has been enabled.

## PDF setup

PDFs render the same stored edition through print HTML and isolated headless Chromium. Urdu fonts are self-hosted with their OFL license in `public/fonts/`; no third-party images are embedded.

On Windows development, set `CHROMIUM_EXECUTABLE_PATH` to the installed Chrome/Edge executable. Production uses the Chromium package. Verify Vercel function bundle size, native dependencies, runtime memory, embedded fonts, pagination, and signed downloads before release. Database-backed PDF generation has not been live-verified while schema access is blocked.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
node scripts/smoke.mjs
```

Run the smoke script while the local app is serving. It checks the public page, unauthenticated private endpoints, worker authentication, and cross-origin mutation rejection. It does not replace cross-account RLS tests.

For simultaneous local preview and production-build verification on Windows, use a separate build directory:

```powershell
$env:NEXT_OUTPUT_DIR='.next-build'
node node_modules/next/dist/bin/next build --webpack
```

Use the same output-directory setting when starting that build. Normal `pnpm build` and `pnpm start` use `.next`; do not run a production build into the active development server's output directory.

## Current validation status

- Production Webpack build and TypeScript checks pass.
- Seventeen unit tests cover explicit/semantic/region/entity ranking, duplicate/future-story filtering, local dates, memory evidence and sensitivity, grouping, source exclusions, and print HTML integrity.
- Desktop and mobile Urdu layouts inspected in the local browser. Authenticated screens remain dependent on schema setup.
- Ten local API smoke checks passed, including unauthenticated denial and cross-origin rejection.
- Four automated Playwright request/API tests passed. They verify boundary behavior, not authenticated end-to-end completion.
- Supabase Auth reports Google provider enabled. The direct PostgreSQL hostname failed DNS resolution; the Dayfold REST table probe did not establish schema readiness.
- The legacy service-account request returned `invalid_grant`; the dedicated Agent Platform API key was subsequently identified and verified successfully. Small live checks passed for Gemini 3.8 synthesis, Gemini 3.7 extraction, and 768-dimensional embeddings. Responses reported distinct 3.8/3.7 model versions. No credential values or raw provider errors were printed.

## Remaining release gates

- Apply/verify migrations using the authorized project connection, then test two-account isolation, OAuth completion, workers, archives, memory, PDFs, and deletion end to end.
- Evaluate grounded English/Urdu outputs on held-out examples. Connectivity checks have passed; quality, throughput, and costs still require measurement.
- Complete configurable delivery hours, retention cleanup, billing reconciliation, exhaustive event instrumentation, worker/queue load handling, and deployment recovery checks.
- Implement and verify content correction/retraction workflows. The initial snapshots and content hashes preserve evidence, but a full correction-management interface is not complete.
- Expand compatible South Asian/current-news supply. A reachable feed does not authorize summaries, translation, storage, or PDF reuse.
- Validate model claims and citation entailment with human review; schema/source-ID validation alone does not establish factual accuracy.
- Perform public-launch security, accessibility, performance, and hosting-plan eligibility reviews. This code is an MVP implementation, not evidence that every target in the specification has been achieved.

See `TODO.md` for the complete backlog and `docs/product-and-architecture-specification.md` for product rationale and source-review evidence.
