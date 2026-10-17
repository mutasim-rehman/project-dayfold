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
- Thirty-one unit tests pass, including OAuth origin handling, schema failure handling, SQL/runtime naming consistency, shared-project export/deletion boundaries, ranking, memory filters, source policy, and print HTML integrity.
- Ten local HTTP smoke checks pass: public page success, private unauthenticated requests denied, worker authentication required, and foreign-origin mutations rejected.
- Desktop layout and mobile Urdu typography/RTL inspected in the browser. Anonymous Ask gate was checked.
- Approved preview endpoint returned 14 eligible articles after correcting a filter that mistook Global Voices' own attribution footer for third-party syndication.
- Small live provider checks passed for Gemini 3.8 synthesis, Gemini 3.7 extraction, and 768-dimensional embeddings. Response model versions were distinct.
- Production Webpack build passed. Four automated request/API integration tests passed; authenticated end-to-end verification remains blocked.

## Blocked live integration

- The configured direct PostgreSQL host has an IPv6 DNS record but this machine returns ENETUNREACH when connecting to it. Supabase REST/Auth is reachable; metadata confirms that only the other app's schema is currently installed. A session-pooler DATABASE_URL is needed to install Dayfold.
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

## OAuth follow-up

Fixed a reproduced local-host mismatch: a request from `127.0.0.1:3000` previously emitted `localhost:3000/auth/callback` after storing the PKCE verifier on the other host. Sign-in now canonicalizes before issuing the verifier. Callback failures have safe distinct categories; same-origin checks respect the actual loopback host. Verified account identity is returned even when profile-table setup is incomplete, so that database issue no longer masquerades as a signed-out account.

Automated checks cover the canonical redirect, verifier-cookie creation, callback URL/challenge, missing-code handling, cross-origin rejection, and verified-account/profile separation. A real Google round trip still requires reader confirmation; no personal Google account was operated by the agent.
# Preferences setup diagnosis

The configured Supabase project also hosts a previous application. The user authorized sharing that project with app-specific table names. The unapplied initial migration and all queries now consistently use `_dayfold` tables/functions, namespaced indexes, and a private `edition-pdfs-dayfold` bucket. The embedded article-version join and dynamic account export also use the new names. Account removal uses a service-only `delete_account_dayfold` transaction instead of deleting the shared Auth identity. Existing application tables, records, Auth configuration, and functions were not changed.

Preference saves report a specific setup error for missing database objects. Thirty-one unit tests pass. The namespaced migration has not been applied or live-verified yet: direct IPv6 connectivity is unavailable and the installed Supabase plugin's SQL tools are not exposed. The pending requirement is the same project's session-pooler URI in DATABASE_URL, not a new project or replacement API keys.

## pgvector schema compatibility

The SQL editor reported that extensions.vector did not exist. The migration had assumed the existing vector extension lived in extensions; CREATE EXTENSION IF NOT EXISTS does not relocate an already installed extension. It now discovers the extension namespace through pg_extension/pg_namespace and safely quotes it in the embedding type, search RPC signature, distance operators, and grants. The search function keeps an empty search_path and uses qualified objects. No shared extension is moved and no existing schema permissions are widened. A subsequent SQL Editor run identified the message source-reference column as another parse error; it is now named source_refs, with API reads aliased back to sources.

Executed the entire migration in isolated PGlite PostgreSQL databases with pgvector installed separately in public, extensions, and custom_vectors. All three passed table/function creation, actual 768-dimensional similarity search, owner-only profile reads, feedback rate limiting, anonymous search rejection, and preservation of an unrelated profiles table. These local fixtures model Supabase Auth/Storage and extension-schema usage grants; remote Supabase execution is still unverified. Test dependencies and runner are isolated under ignored tmp and no deployment credentials were used.
