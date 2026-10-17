# Implementation status

Updated: 17 October 2026. This distinguishes working code from live-service validation and the full planning backlog.

## Implemented locally

- Next.js/React/TypeScript application and Node route handlers; pnpm dependency lock.
- Responsive editorial interface: Today, Ask, Archive, ten-question onboarding/preferences, memory review, and a protected analytics view.
- English/Urdu interface switching, RTL layouts, self-hosted Urdu font and OFL license, accessible control names, reduced motion, dialog keyboard containment.
- Live, attributed Global Voices preview with source-specific original-text filters and shared public-content caching. Unknown/restricted publisher adapters remain disabled.
- Google OAuth initiation/callback and Supabase session validation; Google provider reports enabled on the project.
- Database migration for profiles, source capabilities, content/versions, shared briefs, editions, feedback, conversations/messages, memory, jobs, analytics, and private PDF storage.
- Row ownership policies; private mutation origin checks; database-backed rate limits; server-only privileged writes.
- Explicit/semantic/region/entity ranking, bounded discovery, conservative story grouping, feedback, shared summary caching, and visible retrieval fallback reasons.
- Configurable Gemini synthesis/extraction and multilingual embedding gateway. Dedicated Agent Platform key takes precedence over older service-account credentials.
- Atomic edition/job enqueue, leased retryable jobs, separate indexing batches, fixed 07:00 local morning scheduling for active accounts, and on-demand edition requests.
- Grounded Ask pipeline with bounded memories/history, lexical/semantic retrieval, source-ID/marker validation, stored conversations, and reviewable memory proposals.
- Evidence-hash baseline and later-observed article-version comparison for change briefs; insufficient-evidence response when no reliable comparison exists.
- Print HTML/PDF pipeline with Urdu font embedding, isolated network access, private storage, and authorized signed download requests.
- Account export/delete routes, memory forgetting tombstones, aggregate staff metrics, and initial product/usage events.

## Verified

- TypeScript passes.
- Seventeen unit tests pass for ranking, date boundaries, grouping, memory filters, source-policy exceptions, and print HTML integrity.
- Ten local HTTP smoke checks pass: public page success, private unauthenticated requests denied, worker authentication required, and foreign-origin mutations rejected.
- Desktop layout and mobile Urdu typography/RTL inspected in the browser. Anonymous Ask gate was checked.
- Approved preview endpoint returned 14 eligible articles after correcting a filter that mistook Global Voices' own attribution footer for third-party syndication.
- Small live provider checks passed for Gemini 3.8 synthesis, Gemini 3.7 extraction, and 768-dimensional embeddings. Response model versions were distinct.
- Production Webpack build passed. Four automated request/API integration tests passed; authenticated end-to-end verification remains blocked.

## Blocked live integration

- The configured direct PostgreSQL hostname does not resolve from this environment. Supabase REST/Auth is reachable, but the Dayfold table probe did not establish schema readiness.
- The user's Supabase plugin is confirmed installed. Its SQL/migration tools are not exposed in this execution's callable tool list; no plugin schema changes have been performed or claimed.
- Consequently, migration application, two-account RLS isolation, authenticated edition generation, stored chat/memory, PDF upload/download, account deletion, and worker dispatch still need live verification.
- Do not replace or share model credentials based on the original service-account error: the dedicated platform key works. Keep all values local/server-only.

## Deliberate differences from the longer-term specification

- All conversation-derived memories require reader approval initially; automatic acceptance of nonsensitive explicit interests is not enabled.
- Durable jobs use a PostgreSQL job ledger, not pgmq. Cron must still be configured to invoke the protected worker endpoint.
- Morning delivery is fixed at 07:00 initially; selectable hours are pending.
- Chat responses are returned as complete JSON; incremental streaming is pending.
- Topic classification and story grouping start with conservative deterministic heuristics and require relevance evaluation.
- Retention cleanup, full correction/retraction management, complete impression instrumentation, provider invoice reconciliation, and production load/recovery tests remain pending.
- Source supply remains insufficient for a claim of comprehensive South Asian breaking news.

See [TODO](../TODO.md), [specification](product-and-architecture-specification.md), and [README](../README.md) for the full plan, reasons, and setup instructions. No deployment or billing change has been performed.
