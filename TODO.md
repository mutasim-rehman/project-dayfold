# Dayfold implementation TODO

Planning baseline: 17 October 2026. No time estimates or deadline-based scope reductions.

Reference: [Product and architecture specification](docs/product-and-architecture-specification.md).

Application implementation was authorized by the user after the base decisions. Checking a box means the stated deliverable has been verified, not merely drafted. Live integration and release remain subject to their acceptance gates.

## Implementation progress

- [x] Implement the React/Node application and inspect desktop/mobile Urdu layouts.
- [x] Pass TypeScript and 17 unit tests for recommendation, memory, source filtering, and print HTML logic.
- [x] Pass ten HTTP smoke checks for public availability, anonymous private-data denial, and cross-origin rejection.
- [x] Verify small live calls to Gemini 3.8, Gemini 3.7, and the 768-dimensional embedding endpoint using the dedicated platform key.
- [x] Scan source/client files for configured credential values; no leaks detected.
- [ ] Apply the migration and verify authenticated account flows against the actual Supabase project.
- [ ] Verify database-backed editions, chat, memories, PDFs, scheduling, and two-account isolation end to end.

Detailed implementation/validation distinctions: [implementation status](docs/implementation-status.md).

## Confirmed direction

- [x] Define the personal daily newspaper product and architecture specification.
- [x] Confirm South Asia as the initial market, with global usefulness.
- [x] Confirm English and Urdu, including Urdu right-to-left reading and PDF support.
- [x] Confirm Vercel deployment and Supabase for accounts/data.
- [x] Record Google Agent Platform as the intended model backend; user reports credits and working Gemini 3.7/3.8 access.
- [x] Inspect environment-variable names without printing credential values.
- [x] Review initial source candidates and document access/permission gaps.
- [x] Include personalized Ask, controlled memory, story-change briefs, and internal analytics in scope.

## 1. Final decisions and implementation contracts

Dependencies: existing specification. Decisions below are selected defaults under the user's instruction to choose for reader value. Selection does not mean implementation or service validation is complete.

### Selected decisions and reasons

- [x] **Product scope: an MVP containing the complete daily-paper journey, Ask with controlled memory, change briefs, and essential internal analytics.** Defer billing, native apps, social features, voice, and elaborate staff tooling.
  - Reason: readers can obtain value and return to a complete product; additional features should improve that journey rather than fragment it.

- [x] **Framework: React through Next.js App Router, TypeScript, and Node.js server routes on Vercel. Use pnpm and supported stable releases, pinned at implementation.** Supabase remains the backend platform for identity, database, storage, and durable jobs; Node routes orchestrate private/AI operations.
  - Reason: fast initial reading, familiar navigation, shared type contracts, and one deployment reduce failure points. Next.js supplies routing and server rendering around the requested React/Node stack.

- [x] **UI: mobile-first editorial reading; shared CSS tokens, accessible controls, and CSS transitions. Three.js stays tentative and outside the default bundle.** The initial implementation uses plain CSS; introduce a utility/component dependency only if it improves maintainability. Use 3D only for a justified, lazy-loaded enhancement with a static/reduced-motion alternative.
  - Reason: readers on modest phones and mobile networks need legibility and responsive controls. Decorative 3D must earn its loading and battery cost.

- [x] **Accounts: Google sign-in/sign-up through Supabase Auth with a server-validated PKCE flow. Request only basic identity scopes.** Use the same button for new and returning accounts; Google handles password/account recovery. No app password or SMTP login requirement initially.
  - Reason: fewer forms, no additional password to remember, and a familiar identity experience. A service-account credential cannot substitute for a Google OAuth web client; configure client ID/secret, consent settings, and callbacks separately.

- [x] **Data: Supabase PostgreSQL with RLS, relational migrations, pgvector, lexical search, and private Storage for PDFs.** Ordinary user operations use verified user-scoped access; privileged processing uses tightly scoped server paths.
  - Reason: recommendations, memory, and editions remain consistent and isolated per reader without adding a separate search/database service at MVP scale.

- [x] **Job execution: a PostgreSQL durable job ledger plus Cron-triggered, authenticated Node.js worker endpoints on Vercel.** The MVP implements transactional enqueue, leased claims, retry state and idempotency directly; pgmq remains a later alternative. Cron performs a short HTTP dispatch, not model inference in a database transaction. Put dispatch secrets in protected configuration/Vault; never expose the queue to browsers.
  - Reason: closing a tab must not lose edition/PDF/memory work. Small resumable jobs recover from serverless interruption without duplicate papers. Verify extension availability, HTTP dispatch, quotas, and deployment limits before relying on this combination.

- [x] **Scheduling: precompute an edition for recently active readers around their selected morning time; generate on demand for first-time or inactive returning readers.** Default 07:00 in the selected timezone, editable; initial active window seven days. Target a 15-minute availability window, not exact-time delivery. Run bounded scheduling/dispatch checks, initially every five minutes if quotas allow. Reuse the day's published edition.
  - Reason: a morning paper should usually be ready when the reader arrives, while avoiding resource waste on abandoned accounts. Display pending/delay states accurately. A fallback to first-visit-only delivery requires an explicit product change if infrastructure cannot support this choice.

- [x] **Reading: 5/10/15-minute options, ten minutes by default; target 6–12 distinct story clusters, at least three for a normal edition.** Use content available at generation cutoff; prefer recent developments but allow clearly dated context. Offer eight starting topics: world, local/regional, technology, business/economy, science, health, sports, and culture.
  - Reason: a finite choice helps readers finish. If interests or supply yield fewer than three usable stories, offer a labeled short edition and preference changes; never pad the paper. Reading-time estimates need separate English/Urdu validation.

- [x] **Language: English/Urdu for interface, summaries, Ask, and PDFs; geographic preferences remain independent.** Use explicit locale dictionaries, HTML direction, logical CSS properties, and self-hosted licensed fonts. Select Noto Naskh Arabic as the initial Urdu body-font candidate and verify with Urdu readers; preserve mixed-script names and dates.
  - Reason: language switching should preserve the reader's identity and interests. Familiar, correctly shaped text matters more than ornamental typography.

- [x] **PDF: server-generated print HTML/CSS rendered by isolated headless Chromium using Playwright-compatible tooling; save the result privately in Supabase Storage.** Use the same frozen edition data for web and PDF, embedded fonts, controlled page breaks, and verified source links.
  - Reason: browser text shaping supports Urdu and mixed-direction text while keeping the download consistent with the web edition. A deployed bundle/memory/runtime and rendering proof is required before committing the renderer to production; do not substitute a lossy screenshot export silently.

- [x] **Recommendations: hybrid lexical/semantic retrieval plus interpretable scoring and constrained composition.** Explicit preferences dominate cold start; variety, freshness, feedback, and repetition controls shape the final paper. No collaborative filtering or per-article LLM ranking initially.
  - Reason: readers get useful, explainable results immediately without needing a large behavioral dataset, while we retain a baseline for measuring future improvement.

- [x] **Embeddings: use Google's multilingual embedding endpoint available through the selected cloud project, with a configured 768-dimensional output if supported and evaluated.** Store model/version/dimension metadata, normalize appropriately, use pgvector, and keep query/document task modes consistent. Exact model ID is a validation task; no unsupported ID is assumed.
  - Reason: English queries should find relevant Urdu coverage and vice versa. A bounded vector size controls database cost; cross-language relevance tests must establish quality before activation.

- [x] **LLM routing: application-owned task orchestration behind one provider gateway.** Initially assign Gemini 3.8 to grounded answers/change synthesis and Gemini 3.7 to extraction/classification as benchmark candidates, contingent on distinct working endpoints and measured benefit. Models and limits stay configurable. News retrieval precedes generation; memory extraction is a separately validated job.
  - Reason: users benefit from factual answers and reliable preferences, not the number of model calls. Avoid paying twice when endpoints alias the same model; one model's agreement is not factual verification, and same-project models are not independent outage fallbacks.

- [x] **Sources: adapter-based registry with per-operation permission flags; Global Voices original licensed text is the first conditional source.** Others remain disabled until the documented access/rights gaps are resolved. GDELT is optional discovery. Source expansion remains an activation/release gate.
  - Reason: reliable access, attribution, and sufficiently rich evidence make summaries useful. Restricted or inaccessible content cannot support a dependable product; disclose limited coverage during demonstrations.

- [x] **Memory: show an explicit opt-in to automatic conversational memory, off until enabled; onboarding preferences still persist.** Auto-save only explicit nonsensitive ongoing preferences when enabled, with notice/undo. Inferences remain proposals; sensitive durable topics require confirmation. Session intent expires after 24 hours; ongoing inferred candidates expire after 30 days unless confirmed; user-confirmed preferences remain until changed/deleted.
  - Reason: a one-off question should not reshape someone's newspaper indefinitely. Readers can inspect, correct, disable, and forget what personalizes their experience.

- [x] **Retention defaults: conversations 90 days; raw interaction telemetry 30 days; pseudonymous aggregates 12 months; operational logs 14 days.** Conversation expiry removes memories supported solely by those messages unless the user separately confirmed the preference. Keep editions/PDFs for 90 days initially and disclose the archive window. Run private-data deletion within seven days of request after immediate access revocation; document actual backup expiry separately.
  - Reason: a useful recent archive and learning window should not imply indefinite private-history storage. Expiry, edits, and account deletion must have predictable consequences. These are product defaults requiring a launch privacy review, not claims of legal compliance.

- [x] **Analytics: first-party versioned events and aggregate SQL views in Supabase with a small staff-only dashboard.** Avoid raw chat, detailed interest labels, fingerprinting, and third-party advertising trackers. Respect applicable telemetry choices and keep personalization distinct from product analytics.
  - Reason: learn which features help people and cost money while minimizing behavioral exposure. Popularity alone does not establish willingness to pay.

- [x] **Testing: Vitest for deterministic logic/contracts, database/RLS integration tests, and Playwright for critical browser journeys.** Add held-out English/Urdu relevance, grounding, memory, and change-detection evaluations; visually inspect both PDFs.
  - Reason: the highest-impact failures are wrong news, wrong memories, broken downloads, and cross-account exposure. Checks should protect those outcomes rather than inflate test counts.

- [x] **Deployment/data locality: one supported Vercel Node region close to the existing Supabase project; prefer Mumbai if both available and no migration is required.** Inspect actual project region before final binding; do not move existing data automatically. Use explicit cache ownership and no shared personalized response caching.
  - Reason: shorter API/database trips improve South Asian reading latency without unnecessary geographic complexity; global readers still access the same application.

- [x] **Operational limits: start with two concurrent Ask requests per reader, 20 Ask submissions/hour, 4,000-character prompts, and at most two in-flight generation jobs per account.** Bound retrieved context, daily provider budgets, and global model concurrency in configuration. Queue unique edition/PDF requests; retries must not charge quota twice at the application level.
  - Reason: fair access keeps one burst from making the product unusable for everyone. Show understandable limit/retry messages and tune thresholds from legitimate usage; provider billing can still count repeated upstream attempts.

- [x] **Release posture: limited MVP demonstration first, then public startup release after rights, security, quality, and hosting-plan eligibility gates pass.** Vercel Hobby eligibility for an intended commercial product must be resolved using current plan terms; upgrade/credits or another eligible arrangement may be required, without silently enabling charges.
  - Reason: a free product can still be commercial. Clear readiness gates preserve reader trust without preventing independent implementation work.

### Remaining verification and contracts

- [ ] Pin supported framework/runtime/package versions and verify deployed service compatibility.
- [ ] Validate queue/Cron/HTTP dispatch end to end and the headless PDF deployment/rendering proof.
- [ ] Configure Google OAuth web-client consent, callbacks, allowed audiences, and Supabase provider settings.
- [ ] Inspect existing Supabase region and select the nearest supported Vercel function region.
- [ ] Verify scheduled workload/retention fits service quotas and configure actual operational budgets.
- [ ] Verify Agent Platform authentication, enabled model IDs, structured output, quotas, and credit/billing controls without exposing secrets.
- [ ] Assign configurable model roles using English/Urdu quality, latency, and cost evidence; do not assume version number establishes a cheaper model or independent fallback.
- [ ] Select and validate a multilingual embedding model separately from generative models; define dimensions and indexing/versioning strategy.
- [ ] Define API request/response schemas, error envelopes, pagination, idempotency, and job state contracts.
- [ ] Define database entities, ownership, indexes, uniqueness constraints, and migration strategy.
- [ ] Update conflicting assumptions in the specification, including historical delivery-window references.
- [x] Obtain the user's go-ahead to begin application coding.

Acceptance: implementation choices are documented, unresolved items have explicit scope/impact, and no essential behavior relies on an unspecified service.

## 2. Repository and application foundation

Dependencies: phase 1; implementation authorization.

- [ ] Establish repository/version control and confirm the challenge's repository creation rule before publishing anything.
- [ ] Create application structure with clear content, recommendation, edition, Ask, memory, and analytics modules.
- [ ] Configure formatting, linting, type checking, meaningful test tooling, and CI checks.
- [ ] Add an environment template with variable names only; exclude local secrets from version control.
- [ ] Validate configuration server-side and keep service-role/model credentials out of browser bundles.
- [ ] Separate local, preview, and production configuration/data access.
- [ ] Add request IDs, structured error reporting, and log redaction.
- [ ] Establish shared English/Urdu localization, language switching, RTL primitives, and font strategy.

Acceptance: the empty application builds reproducibly, configuration fails clearly when incomplete, and no credential values appear in committed files or client output.

## 3. Accounts, database, and security boundaries

Dependencies: phases 1–2.

- [ ] Create versioned Supabase migrations for profiles/preferences, sources/articles, editions, feedback, conversations, memories, jobs, usage, and audit records.
- [ ] Implement authentication, session validation, logout, recovery, and account settings.
- [ ] Apply row-level security and explicit grants to every private table and storage bucket.
- [ ] Derive identity from verified sessions; validate ownership for every private object/API.
- [ ] Restrict elevated service-role operations to trusted server paths.
- [ ] Add rate limits, input limits, safe content rendering, secure session settings, and CSRF protections as applicable.
- [ ] Define staff access separately from ordinary user access; require strong administrative authentication.
- [ ] Implement account export/deletion workflow and cancellation of future account jobs.
- [ ] Define backup/restore capabilities, actual free-tier limitations, and retention policies.
- [ ] Test cross-account reads/writes, forged IDs, expired sessions, and private PDF access.

Acceptance: two test accounts cannot access each other's private records through APIs, database access, storage, or signed-link generation.

## 4. Source supply and content ingestion

Dependencies: source contracts from phase 1; shared-content schema from phase 3. Unresolved publisher rights block that source's activation, not unrelated development.

- [ ] Create source registry fields for health, provenance, geography, language, attribution, and independently permitted operations.
- [ ] Implement an adapter interface and conditional Global Voices text adapter with item-level license handling.
- [ ] Secure sufficient compatible regional/current-news supply before claiming broad South Asian daily coverage.
- [ ] Keep Dawn, BBC, Indian Express, Dhaka Tribune, and Al Jazeera disabled until their documented permission/access gaps are resolved.
- [ ] Keep GDELT optional until tested; apply destination-source policy to every discovered item.
- [ ] Add bounded fetching, timeouts, conditional requests, backoff, source limits, and SSRF/redirect restrictions.
- [ ] Normalize canonical URLs, publisher identity, timestamps, languages, and content versions.
- [ ] Quarantine malformed and suspiciously future-dated items; resolve observed timestamp inconsistencies.
- [ ] Sanitize text and reject insufficient material for the requested summary depth.
- [ ] Deduplicate exact articles and conservatively group stories about the same event.
- [ ] Preserve corrections/retractions and invalidate affected derived content.
- [ ] Test fetch behavior from the intended hosting environment.

Acceptance: repeated ingestion is idempotent, unauthorized operations remain disabled, and every usable item has provenance and sufficient evidence for its intended output.

## 5. Evaluation baseline and shared AI processing

Dependencies: phases 3–4. Evaluation fixtures can be prepared earlier using permitted or explicitly synthetic material.

- [ ] Build versioned reader profiles and relevance judgments, including South Asian and global interests.
- [ ] Create held-out English/Urdu grounding, temporal comparison, and memory-extraction cases.
- [ ] Establish a simple fresh-topic recommendation baseline before tuning the hybrid system.
- [ ] Implement a server-side model gateway with versioned prompts, task configuration, structured-output validation, deadlines, and usage records.
- [ ] Extract canonical topics/entities and generate reusable multilingual embeddings.
- [ ] Generate permitted article summaries once per content/model/prompt/language version.
- [ ] Validate source IDs, claim support, dates, names, numbers, and uncertainty in both languages.
- [ ] Cache shared results safely and bound concurrency, retries, context sizes, and token budgets.
- [ ] Keep routine logs free of raw private prompts and conversations.

Acceptance: outputs pass their schemas and evidence checks; processing is reproducible and its cost/latency are recorded. Synthetic data is labeled and never presented as actual usage evidence.

## 6. Onboarding and recommendation engine

Dependencies: phases 3–5.

- [ ] Implement the ten questions with skips, documented defaults, progress, and editable answers.
- [ ] Map each answer to an implemented ranking, eligibility, or presentation effect.
- [ ] Separate language, geographic preferences, topics/entities, reading purpose, depth, discovery, uncertainty tolerance, and update frequency.
- [ ] Retrieve candidates from explicit interests, semantic relevance, geography, followed stories, and discovery.
- [ ] Implement versioned ranking features and deterministic exclusion rules.
- [ ] Compose editions with story deduplication, diversity, freshness, and reading-budget constraints.
- [ ] Generate recommendation explanations from actual ranking signals.
- [ ] Record impressions and position before interpreting clicks or non-clicks.
- [ ] Implement more/less/already-read feedback with deduplication, conservative weighting, and decay.
- [ ] Evaluate relevance, retrieval recall, NDCG@10, repetition, coverage, and cohort regressions against the baseline.

Acceptance: different profiles yield explainably different selections, corrections affect future rankings, and measured results satisfy the agreed quality gates or explicitly block release.

## 7. Complete daily paper, archive, and PDF

Dependencies: phases 4–6; approved source supply for public coverage claims.

- [ ] Implement idempotent edition jobs with frozen profile/ranker versions and content cutoffs.
- [ ] Enforce one primary edition per reader-local date and handle timezone changes explicitly.
- [ ] Publish snapshots atomically; expose queued, building, available, and unavailable states.
- [ ] Build Today with lead story, sections, source links, recommendation reasons, feedback, and a finite ending.
- [ ] Add stable story detail/navigation without exposing private edition data.
- [ ] Build archive pagination and dated edition retrieval.
- [ ] Generate matching newspaper-style PDFs from the same frozen edition content.
- [ ] Validate Urdu shaping, RTL order, mixed-direction text, fonts, pagination, and links in web/PDF.
- [ ] Store PDFs privately; authorize downloads and generate short-lived signed access.
- [ ] Retry PDF creation independently of edition publication.
- [ ] Add correction/retraction notices and explicit artifact revisions.
- [ ] Verify web/PDF content parity and stale/insufficient-content behavior.

Acceptance: a reader can onboard, read a real edition, download its matching PDF, revisit it, and influence a later edition without partial publication or duplicate jobs.

## 8. Personalized Ask and controlled memory

Dependencies: phases 3–6; story access from phase 7.

- [ ] Build Ask conversation ownership, persistence, bounded context, and streaming/error states.
- [ ] Retrieve news using lexical and semantic search with explicit date/topic constraints.
- [ ] Retrieve only relevant accepted memories; current query intent overrides general history.
- [ ] Generate cited English/Urdu answers with evidence timestamps and insufficient-evidence behavior.
- [ ] Isolate user input, saved context, and untrusted source text in prompt construction.
- [ ] Run separate structured extraction of zero or more memory proposals per turn.
- [ ] Validate message evidence, scope, sensitivity, allowed operations, and owner server-side.
- [ ] Implement temporary intent, ongoing interests, confirmation states, conflict resolution, and expiry.
- [ ] Add extraction idempotency and concurrency controls; prevent replay from resurrecting forgotten memories.
- [ ] Build inspect/edit/forget/disable controls and visible save/undo feedback.
- [ ] Preserve valid answers when memory extraction fails; report save success only after commit.
- [ ] Test negation, quotation, third-party statements, sensitive inference, malicious articles, deletion, and simultaneous updates.

Acceptance: answers are grounded, memory changes match actual user intent, and models cannot authorize data access or write directly to private records.

## 9. “What changed?” story briefs

Dependencies: story clustering, versioned evidence, grounded generation, and reader-exposure tracking.

- [ ] Store dated story developments with supporting evidence and correction history.
- [ ] Resolve a reader-selected or accurately labeled exposure baseline.
- [ ] Distinguish newly published developments from newly discovered reporting and repeated coverage.
- [ ] Generate cited previous-state/new-development/remaining-uncertainty briefs.
- [ ] Reuse compatible story-level comparisons and invalidate them when evidence changes.
- [ ] Return “no material change” when supported; avoid assuming comprehension from opening a story.
- [ ] Evaluate temporal accuracy and false-change detection in English and Urdu.

Acceptance: every claimed change has evidence after the stated baseline; repeated wording alone does not become a development.

## 10. Analytics, feedback, and unit economics

Dependencies: event contracts and identity boundaries; feature-specific instrumentation follows phases 6–9.

- [ ] Define versioned events, deduplication, meaningful impressions, activation, and retention cohorts.
- [ ] Instrument onboarding, editions, feedback, Ask, PDFs, memory corrections, and change briefs.
- [ ] Separate analytics events from personalization memory and exclude raw private text/sensitive labels.
- [ ] Track success/failure, latency, token usage, and estimated cost by task/model/version.
- [ ] Account for shared enrichment, retries, PDFs, and infrastructure when estimating per-reader costs.
- [ ] Build a protected aggregate dashboard with role-based access and minimum cohort sizes.
- [ ] Add helpfulness/value feedback so popularity is not mistaken for usefulness.
- [ ] Document free-launch learning goals and a later willingness-to-pay experiment; defer payment implementation.
- [ ] Keep core reading available during telemetry failures; expose event loss counts operationally.

Acceptance: feature usage, reported value, retention, and costs can be inspected with consistent definitions and appropriate privacy boundaries.

## 11. UX completion and accessibility

Dependencies: functional flows; foundational English/Urdu support begins in phase 2.

- [ ] Establish final typography, spacing, colors, responsive layouts, and reusable interaction patterns.
- [ ] Polish Today, Ask, Archive, Preferences & Memory, account flows, and staff analytics.
- [ ] Add restrained transitions, reduced-motion behavior, visible feedback, and clear loading/error states.
- [ ] Check keyboard navigation, focus, screen-reader names, contrast, touch targets, and mobile layouts.
- [ ] Test Urdu mixed-script text, numbers, dates, clipping, and reading order on representative screens.
- [ ] Observe target-reader usability sessions and resolve major friction.

Acceptance: core tasks are understandable and accessible in both supported languages; aesthetic polish does not obscure sources, dates, or controls.

## 12. Reliability, scale, and release readiness

Dependencies: completed functional features and their individual acceptance checks.

- [ ] Run type/lint/build checks and meaningful integration/end-to-end tests.
- [ ] Run recommendation, grounding, memory, and temporal evaluation gates defined in the specification.
- [ ] Test worker crashes, duplicate jobs, provider timeouts/429s, source failures, malformed outputs, database outages, and queue backlog.
- [ ] Test account deletion during running jobs, cache isolation, and artifact revocation.
- [ ] Perform security review of authorization, RLS, secrets, injection, SSRF, XSS, session behavior, and administrative access.
- [ ] Load-test the documented workload; report hardware/service limits, corpus size, concurrency, cache state, latency, and errors.
- [ ] Verify backup restoration or document an explicit release-blocking gap if the chosen tier cannot support the requirement.
- [ ] Set operational alerts, cost budgets, quota handling, and rollback procedures.
- [ ] Validate Vercel deployment configuration, Supabase migrations, callback URLs, private storage, and job invocation authentication.
- [ ] Produce deployment/runbook instructions, architecture diagram, decision records, and known limitations.
- [ ] Prepare the challenge demonstration and submission artifacts without fabricating user traction or measured capacity.
- [ ] Confirm source permissions and actual coverage before public-launch claims.
- [ ] Have the user deploy to Vercel as requested; run production smoke checks afterward.

Acceptance: release gates have evidence, unresolved blockers are explicit, and measured behavior—not targets—is used in product and judge-facing claims.

## Current blockers and next action

- Broad South Asian news supply remains unresolved; Global Voices alone does not cover the full promise.
- Exact embedding model ID, pinned software versions, deployed renderer/job behavior, OAuth configuration, and hosting eligibility need verification; product defaults are selected above.
- Migration application/live data flows await a usable database or callable plugin SQL connection; the plugin is installed but its SQL tools were not exposed in this execution.

Next action: apply and verify the schema through the user's authorized Supabase connection, then complete authenticated integration tests. Source agreements and release-quality evaluation remain separate gates.
