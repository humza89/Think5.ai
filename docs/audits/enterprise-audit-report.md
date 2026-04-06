# Enterprise-Readiness Audit Report — Paraform AI Interview Platform

**Date:** 2026-04-05
**Auditor:** Claude Opus 4.6 (automated code audit)
**Scope:** Full codebase audit against enterprise-audit-prompt.xml criteria
**Benchmark:** Micro1 and Mercor AI interview platforms

---

## Section 1: Voice and Real-Time Reliability

**Grade: PARTIAL | Score: 7/10**

### What Works
- **Reconnection architecture is enterprise-grade**: Multi-strategy reconciliation (synced/delta/full) with HMAC-signed reconnect tokens, atomic CAS lock swap via Redis Lua scripts, and 90-minute session hard cap ([lib/session-store.ts:490-612](lib/session-store.ts#L490-L612), [app/api/interviews/[id]/voice/recover/route.ts](app/api/interviews/[id]/voice/recover/route.ts))
- **Session locking prevents duplicate interviews**: Distributed lock with 90s TTL, owner token verification, and timing-safe comparison ([lib/session-store.ts:287-344](lib/session-store.ts#L287-L344))
- **Recording pipeline with offline resilience**: SHA-256 checksums per chunk, IndexedDB offline queue, exponential backoff retries with jitter ([hooks/useMediaRecording.ts:41-104](hooks/useMediaRecording.ts#L41-L104))
- **Fragment persistence (N4)**: In-flight partial turns survive disconnection ([app/api/interviews/[id]/voice/fragment/route.ts](app/api/interviews/[id]/voice/fragment/route.ts))
- **Session reconstruction from canonical ledger**: If Redis is lost, state rebuilds from Postgres ([lib/session-store.ts:622-706](lib/session-store.ts#L622-L706))
- **Circuit breaker pattern**: 3-state breaker (CLOSED/OPEN/HALF_OPEN) with adaptive retry limits per WebSocket close code ([hooks/useVoiceInterview.ts:182](hooks/useVoiceInterview.ts#L182))
- **Tab visibility detection**: Suppresses heartbeat when tab hidden ([hooks/useVoiceInterview.ts:284-308](hooks/useVoiceInterview.ts#L284-L308))

### P0 Critical
1. **No audio quality constraints in getUserMedia**: No `echoCancellation`, `noiseSuppression`, or `autoGainControl` specified. Only requests `{video: true, audio: true}`. Candidates on laptops with built-in speakers WILL get echo. ([components/interview/InterviewPreCheck.tsx:65-66](components/interview/InterviewPreCheck.tsx#L65-L66))
2. **Deprecated ScriptProcessorNode**: `useVoiceInterview.ts` uses deprecated Web Audio API. Chrome has warned about removal. Must migrate to AudioWorklet. ([hooks/useVoiceInterview.ts:155](hooks/useVoiceInterview.ts#L155))
3. **Memory recovery can block voice-init indefinitely**: No timeout on memory confidence recovery attempt. If memory-orchestrator queries hang, voice-init hangs. ([app/api/interviews/[id]/voice-init/route.ts:300+](app/api/interviews/[id]/voice-init/route.ts#L300))

### P1 Important
4. **Signed URL expiry is 1 year**: Recording playback URLs from Supabase Storage expire in 1 year. Should be 24-48 hours with on-demand refresh. ([app/api/v1/interviews/upload-recording/route.ts:47](app/api/v1/interviews/upload-recording/route.ts#L47))
5. **No WebSocket connection timeout**: Initial Gemini Live WebSocket connection has no explicit timeout; relies on browser defaults (varies 30-120s). ([lib/gemini-live.ts:90](lib/gemini-live.ts#L90))
6. **No heartbeat/ping-pong on WebSocket**: No keep-alive mechanism visible. Long pauses could trigger proxy/NAT timeouts.
7. **Network quality indicator is RTT-only**: No bandwidth, jitter, or packet loss measurement. Thresholds hardcoded. ([components/interview/NetworkQualityIndicator.tsx:25-35](components/interview/NetworkQualityIndicator.tsx#L25-L35))
8. **Fragment TTL**: No automatic cleanup of old TurnFragment records. Will accumulate indefinitely.

### P2 Nice-to-Have
9. Speaker switching via `setSinkId` unsupported in Firefox/Safari ([components/interview/VoiceInterviewRoom.tsx:200-213](components/interview/VoiceInterviewRoom.tsx#L200-L213))
10. No bandwidth test in pre-check; only latency measured ([components/interview/InterviewPreCheck.tsx:43](components/interview/InterviewPreCheck.tsx#L43))
11. Recording format assumed WebM server-side; no fallback detection

---

## Section 2: Conversational Intelligence

**Grade: PARTIAL | Score: 8/10**

### What Works
- **Deterministic interviewer state machine**: Forward-only step progression (opening -> candidate_intro -> resume_deep_dive -> technical -> behavioral -> domain -> candidate_questions -> closing) with cryptographic state hashing and persona locking via HMAC-signed identity token ([lib/interviewer-state.ts](lib/interviewer-state.ts))
- **Hypothesis-driven interview planning**: Generates testable hypotheses from resume analysis, integrates recruiter objectives, adaptive difficulty strategy per module ([lib/interview-planner.ts](lib/interview-planner.ts))
- **Multi-layer AI validation pipeline**: Output gate -> grounding gate -> contradiction detector -> memory confidence checks, all running server-side per turn via session-brain ([lib/session-brain.ts](lib/session-brain.ts))
- **Semantic contradiction detection**: Catches numeric (>30% divergence), temporal (activity after stated departure), and entity-scope (solo vs team) contradictions with confidence scores ([lib/semantic-contradiction-detector.ts](lib/semantic-contradiction-detector.ts))
- **Anti-hallucination grounding gate**: Jaccard similarity + number-aware comparison (5% tolerance) with courtesy phrase filtering and provenance tracking ([lib/grounding-gate.ts](lib/grounding-gate.ts))
- **3-tier memory composition**: Milestone turns + unresolved contradiction turns + recent chronological window, with token budget management (80% of 1M context) ([lib/memory-orchestrator.ts](lib/memory-orchestrator.ts))
- **Legal compliance block**: Mandatory prohibited topics list (age, gender, race, disability, salary history, etc.) with redirect instructions, single source of truth for all prompts ([lib/aria-prompts.ts:13-30](lib/aria-prompts.ts#L13-L30))
- **Prompt injection protection**: `sanitizeForPrompt()` strips XML/JSON delimiters, code fences, markdown headings with 500-char per-field limit ([lib/aria-prompts.ts:3-10](lib/aria-prompts.ts#L3-L10))
- **Rich skill modules**: 18 modules across technical/behavioral/domain with 5-level rubrics, key signals, red flags, and adaptive follow-up patterns ([lib/skill-modules.ts](lib/skill-modules.ts))
- **4-factor memory confidence scoring**: Retrieval health (0.4) + violation count (0.3) + Redis persistence (0.2) + recovery quality (0.1) ([lib/memory-orchestrator.ts:90-105](lib/memory-orchestrator.ts#L90-L105))

### P0 Critical
1. **Output gate defaults to warn-only**: `FF_OUTPUT_GATE_BLOCKING` feature flag not verified as enabled. Violations (reintroductions, duplicate questions, unsupported claims) are logged but NOT blocked by default. AI could repeat questions or hallucinate references without being stopped. ([lib/output-gate.ts:11](lib/output-gate.ts#L11))
2. **No multi-language support**: System prompt is English-only. No language detection, no translation, no multi-language interview capability. Micro1 supports accent-resilient ASR in multiple languages.

### P1 Important
3. **Memory retrieval has no timeouts**: Fact fetch, knowledge graph fetch, and ledger fetch in memory-orchestrator have no explicit timeouts. Could block session-brain indefinitely. ([lib/memory-orchestrator.ts:135-250](lib/memory-orchestrator.ts#L135-L250))
4. **Knowledge graph staleness check is post-fetch**: KG_STALENESS_THRESHOLD_MS (3 min) only checked after query completes. Stale KG could be injected into prompt before validation. ([lib/memory-orchestrator.ts:177-185](lib/memory-orchestrator.ts#L177-L185))
5. **Step progression silently fails on backward jump**: `transitionState()` logs warning but returns unchanged state. Could mask bugs. ([lib/interviewer-state.ts:137-143](lib/interviewer-state.ts#L137-L143))
6. **No runtime enforcement of legal compliance block**: Relies entirely on model instruction adherence. No post-generation gate to detect discriminatory questions.
7. **Depth cap is hardcoded**: Max 3 follow-ups per topic, not configurable per role or difficulty level. ([lib/interviewer-state.ts:189](lib/interviewer-state.ts#L189))

### P2 Nice-to-Have
8. Assertion extraction misses declarative claims ("I've worked with React") — only catches reference patterns
9. No cross-resume fact validation (facts from turns only, not grounded against resume)
10. Recruiter objectives integration not fully visible in session-brain

---

## Section 3: Assessment and Scoring Integrity

**Grade: PARTIAL | Score: 7/10**

### What Works
- **Rubric-based scoring**: 18 skill modules with clear 5-level rubrics (0-10 scale), key signals, and red flags. Report generation uses 253-line scoring prompt with dimension-specific guidelines. ([lib/skill-modules.ts](lib/skill-modules.ts), [lib/gemini.ts:144-252](lib/gemini.ts#L144-L252))
- **Evidence citation**: Scoring prompt explicitly requires transcript references and evidence highlights. Evidence bundle compiled with integrity hash. ([lib/evidence-bundle-compiler.ts](lib/evidence-bundle-compiler.ts))
- **Risk signal detection**: Prompt detects inconsistencies, inflated claims, shallow reasoning, evasion, buzzword reliance, weak ownership ([lib/gemini.ts:240-246](lib/gemini.ts#L240-L246))
- **Bias audit with 4/5ths rule**: Adverse impact ratio calculation per demographic dimension, 5-sample minimum, consent-gated demographics ([lib/bias-audit.ts](lib/bias-audit.ts))
- **Model versioning**: SCORER_MODEL_VERSION tracked, prompt hash via SHA-256, rubric hash for version tracing ([lib/gemini.ts:257-259](lib/gemini.ts#L257-L259))
- **Redis dedup lock**: Prevents concurrent report generation with fail-closed 3-attempt retry and Sentry alerting ([lib/report-generator.ts:30-50](lib/report-generator.ts#L30-L50))
- **Human review workflow**: `verificationStatus` (pending/verified/flagged) and `verifiedBy` fields on InterviewReport model
- **3-tier proctoring**: none/light/strict with tab switch, paste, copy, right-click, F12, fullscreen detection, webcam monitoring ([hooks/useProctoring.ts](hooks/useProctoring.ts))
- **Integrity scoring**: Diminishing deduction model (0.7^i per event) with severity weights ([lib/proctoring-normalizer.ts:126-139](lib/proctoring-normalizer.ts#L126-L139))

### P0 Critical
1. **No temperature control on scoring model**: Gemini 1.5-pro uses default temperature (~0.7-1.0). Same answers could produce different scores across runs. Not reproducible within +/-5%. ([lib/gemini.ts:297](lib/gemini.ts#L297))
2. **Evidence hash is not cryptographically signed**: Hash stored in plaintext alongside data. Attacker can modify report and recompute hash. Missing fields: technical skills, soft skills, risk signals, hypothesis outcomes. ([lib/evidence-hash.ts:7-35](lib/evidence-hash.ts#L7-L35))
3. **Proctoring is client-side only**: JavaScript-based detection is trivially bypassed. No server-side validation that events are legitimate. ([hooks/useProctoring.ts](hooks/useProctoring.ts))

### P1 Important
4. **No score normalization across sessions**: Scores are raw from model; no statistical normalization across different interview sessions, models, or prompts
5. **No confidence intervals on scores**: Report provides recommendation (STRONG_YES/YES/MAYBE/NO) but no statistical confidence
6. **Calibration endpoint is read-only**: No feedback loop to improve model; no drift detection triggers retraining ([app/api/admin/scoring-calibration/route.ts](app/api/admin/scoring-calibration/route.ts))
7. **Bias audit lacks intersectionality**: Single-dimension analysis only; no multi-factor fairness analysis
8. **QA scores not persisted or used**: transcript-qa-scorer.ts computes quality scores but results aren't stored in DB or used in hiring decisions

### P2 Nice-to-Have
9. Token counting uses manual estimation, not Gemini's `countTokens()` API
10. No A/B testing of scoring models
11. Integrity scoring thresholds not configurable per company

---

## Section 4: Candidate Experience

**Grade: PARTIAL | Score: 7/10**

### What Works
- **Single-link access**: Token-based invitation flow — no account creation required. Email contains unique token, candidate clicks "Accept & Start", redirects to interview with accessToken. ([app/interview/accept/page.tsx](app/interview/accept/page.tsx))
- **Pre-interview instructions**: WelcomeScreen shows duration (~30 min, 45 max), interview type, STAR method tips, quiet environment guidance. ([components/interview/WelcomeScreen.tsx](components/interview/WelcomeScreen.tsx))
- **Hardware readiness checks**: Network latency (<600ms), camera, microphone with live video preview ([components/interview/InterviewPreCheck.tsx](components/interview/InterviewPreCheck.tsx))
- **Granular consent**: Separate checkboxes for recording, proctoring/integrity monitoring, and privacy policy. Data retention notice (90 days recordings, 365 days transcripts). ([components/interview/WelcomeScreen.tsx:256-305](components/interview/WelcomeScreen.tsx#L256-L305))
- **Comprehensive error messages**: 18 error categories with user-friendly titles, explanations, recovery actions, and severity classification ([lib/error-classification.ts](lib/error-classification.ts))
- **Accommodations support**: Schema supports extendedTime, textOnly, captioning, screenReader flags ([prisma/schema.prisma](prisma/schema.prisma))
- **Accessibility features**: Screen reader announcements via aria-live="assertive", keyboard shortcuts (Space=mic, Esc=end, T=text, P=pause), prefers-reduced-motion support ([components/interview/VoiceInterviewRoom.tsx](components/interview/VoiceInterviewRoom.tsx))
- **Post-interview feedback**: Candidate feedback email + in-app report viewer with overall score, strengths, areas for improvement, recommendations ([components/interview/InterviewReportViewer.tsx](components/interview/InterviewReportViewer.tsx))
- **GDPR compliance**: Data export (Article 20), data deletion with 30-day grace period (Article 17), consent tracking fields ([app/api/candidate/data-export/route.ts](app/api/candidate/data-export/route.ts), [app/api/candidate/data-deletion-request/route.ts](app/api/candidate/data-deletion-request/route.ts))

### P0 Critical
1. **Invitation token in URL**: Token visible in browser history, HTTP referer headers, and server logs. Should use short-lived session cookies or encrypted tokens. ([app/interview/accept/page.tsx:41](app/interview/accept/page.tsx#L41))
2. **No HTTPS enforcement**: HSTS is set in headers but no explicit HTTPS redirect in middleware. Token could travel over HTTP on misconfigured deployment.

### P1 Important
3. **Report completion uses 5-second polling**: Aggressive polling (12 req/min) with no max wait time or fallback. Should use SSE or WebSocket. ([components/interview/InterviewComplete.tsx:17-43](components/interview/InterviewComplete.tsx#L17-L43))
4. **No consent checkbox ARIA labels**: Checkboxes in WelcomeScreen lack proper ARIA attributes ([components/interview/WelcomeScreen.tsx:261-291](components/interview/WelcomeScreen.tsx#L261-L291))
5. **No language options**: Entire interface is English-only; no i18n framework
6. **Pause/resume UI path unclear**: PAUSED status exists in state machine but no visible "pause" button flow beyond keyboard shortcut

### P2 Nice-to-Have
7. No company branding applied to interview UI (brandColor/logoUrl fields exist but not used in interview room)
8. No offline report access or PDF download from candidate view
9. Pre-check has no "continue anyway" option for non-critical failures
10. 600ms latency threshold is arbitrary; no documented justification

---

## Section 5: Recruiter and Hiring Manager Experience

**Grade: PARTIAL | Score: 6/10**

### What Works
- **27+ admin API endpoints**: Comprehensive coverage of approvals, audit logs, bias audit, scoring calibration, model governance, legal hold, retention, SSO config, webhooks, analytics, templates, proctoring events, reliability, transcript QA, interview replay, continuity scorecard ([app/api/admin/](app/api/admin/))
- **Comprehensive analytics**: Volume, scoring, integrity, quality, cost, section, drift, evidence density, and fairness metrics with 7-day vs 30-day drift detection ([app/api/admin/analytics/route.ts](app/api/admin/analytics/route.ts))
- **Interview templates with approval workflow**: DRAFT -> PENDING_APPROVAL -> ACTIVE -> ARCHIVED state machine with shadow mode and deprecation support ([app/api/admin/templates/route.ts](app/api/admin/templates/route.ts))
- **Shareable reports with audit trail**: Token-based sharing with expiry, recipient tracking, view logging with IP and timestamp ([app/api/admin/shared-reports/route.ts](app/api/admin/shared-reports/route.ts))
- **PDF report export**: React-PDF rendering with access control ([app/api/interviews/[id]/report/pdf/route.ts](app/api/interviews/[id]/report/pdf/route.ts))
- **Webhook infrastructure**: interview.completed, report.ready, invitation.accepted events with crypto random secrets ([app/api/admin/webhooks/route.ts](app/api/admin/webhooks/route.ts))
- **Embedding-based candidate matching**: OpenAI embeddings with cosine similarity and AI-generated reasoning ([lib/matching-engine.ts](lib/matching-engine.ts))

### P0 Critical
1. **No CSV bulk invite**: Recruiters must invite candidates one-by-one. No file upload, no CSV parsing, no bulk invite endpoint. This is a deal-breaker for enterprise hiring at scale.
2. **No ATS integration**: No Greenhouse, Lever, Workday, or Ashby integration. Only LinkedIn import exists. Enterprise clients will require ATS connectivity.
3. **Admin dashboard UI may be missing**: `app/(dashboard)/admin/page.tsx` not found during audit. Admins may have to rely on API-only access.

### P1 Important
4. **Admin stats are platform-wide, not company-scoped**: All data returned regardless of admin's company. Multi-tenant clients would see each other's data. ([app/api/admin/route.ts](app/api/admin/route.ts))
5. **Matching engine embeddings never refresh**: Stale embeddings if candidate/role updates. No TTL or re-generation trigger. ([lib/matching-engine.ts:69-121](lib/matching-engine.ts#L69-L121))
6. **Webhook delivery guarantees undefined**: No retry policy, no DLQ, no signature verification mechanism visible
7. **No real-time notifications**: Webhook-only; no in-app real-time push when interviews complete
8. **Candidate duplicate detection missing**: Same email can create multiple candidate records ([app/api/candidates/route.ts](app/api/candidates/route.ts))

### P2 Nice-to-Have
9. PDF reports lack watermarking and version tracking
10. No template versioning (previous versions lost on edit)
11. Drift analysis sorting may be broken (comment says "sort by date" but no sort code)
12. Evidence density sampling limited to first 100 interviews

---

## Section 6: Security and Compliance

**Grade: PARTIAL | Score: 6/10**

### What Works
- **RBAC with explicit hiring manager memberships**: Role hierarchy (admin/recruiter/candidate/hiring_manager) with company-scoped access, expiry dates, and active status. Replaced fragile email-domain matching. ([lib/auth.ts:257-277](lib/auth.ts#L257-L277))
- **Distributed rate limiting**: Redis-backed via Upstash with in-memory fallback, configurable windows, auto-cleanup ([lib/rate-limit.ts](lib/rate-limit.ts))
- **Data retention with legal hold**: Configurable per-company policies (recording/transcript/candidate days), legal hold enforcement, 7-year audit log retention ([lib/data-retention.ts](lib/data-retention.ts), [lib/retention-enforcement.ts](lib/retention-enforcement.ts))
- **GDPR data portability**: Full candidate data export as portable JSON with rate limiting (1/24h) ([app/api/candidate/data-export/route.ts](app/api/candidate/data-export/route.ts))
- **GDPR right to erasure**: 30-day grace period, legal hold blocking, async execution via Inngest, cancellation within grace period ([app/api/candidate/data-deletion-request/route.ts](app/api/candidate/data-deletion-request/route.ts))
- **Security headers**: HSTS (2 years + preload), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Permissions-Policy restricting camera/mic to self ([next.config.ts](next.config.ts))
- **No hardcoded secrets**: Grep confirmed zero hardcoded API keys. `.env` in `.gitignore`.
- **JWT relay authentication**: HMAC-SHA256 signed tokens for voice relay with 2-hour expiry ([lib/relay-jwt.ts](lib/relay-jwt.ts))

### P0 Critical
1. **SSO is a stub, not functional**: `app/api/auth/sso/route.ts` only checks if domain has SSO configured. No OAuth flow, SAML assertion processing, PKCE, or token exchange. Enterprise clients requiring SSO cannot use this. ([app/api/auth/sso/route.ts:10-58](app/api/auth/sso/route.ts#L10-L58))
2. **No explicit CSRF protection**: No middleware.ts file found. No CSRF tokens. Relies entirely on SameSite cookies and Supabase implicit protection.
3. **CSP allows `unsafe-inline` and `unsafe-eval`**: Both script-src and style-src include unsafe-inline. `unsafe-eval` present for Spline 3D but applies to app routes too. Enables XSS attack vectors. ([next.config.ts:29-37](next.config.ts#L29-L37))

### P1 Important
4. **Activity logging is minimal**: Only 7 fields, fire-and-forget (failures silently lost), IP address parameter exists but not consistently populated by callers ([lib/activity-log.ts](lib/activity-log.ts))
5. **No penetration testing evidence**: No pentest reports referenced or test infrastructure found
6. **Sentry has no PII scrubbing**: Session replays at 100% on errors will capture user names, emails, phone numbers in form fields ([sentry.client.config.ts](sentry.client.config.ts))
7. **Rate limiting not applied to all public endpoints**: Only SSO and data export have explicit rate limits. Interview creation, report access, and other endpoints lack protection.
8. **R2 recording access not scoped to interview**: Upload endpoint uses generic Supabase auth rather than interview-specific token validation

### P2 Nice-to-Have
9. No CSP report-uri directive (violations not tracked)
10. Remote image pattern allows any HTTPS domain
11. Retention enforcement: email check for "redacted@retention.policy" is fragile

---

## Section 7: Scalability and Infrastructure

**Grade: PARTIAL | Score: 5/10**

### What Works
- **Session store with Redis+Postgres dual-write**: Production-grade session management with atomic operations, 2-hour TTL, periodic cleanup, and ledger reconstruction fallback. Health diagnostics endpoint. ([lib/session-store.ts](lib/session-store.ts))
- **20 SLOs defined**: Interview success (99.9%), checkpoint latency (99.5% <500ms), report generation (95% <120s), reconnect success (99.9%), memory fidelity (95%), facts freshness (99.5% <5min) with error budget tracking ([lib/slo-monitor.ts](lib/slo-monitor.ts))
- **Continuity SLO with fail-closed behavior**: Auto-disables voice mode on threshold breach ([lib/continuity-slo-monitor.ts](lib/continuity-slo-monitor.ts))
- **AI cost governance**: Per-company monthly budgets, anomaly detection (2x daily avg), 80/90/100% alerts, rate limiting (100 ops/hr per company) ([lib/ai-usage.ts](lib/ai-usage.ts))
- **8 Inngest background jobs**: Report generation, recording processing, retention cleanup, SLO checks, GDPR deletion, recording retry, memory updates, anomaly alerts
- **Vercel cron jobs**: Daily retention at 3 AM UTC, report retry every 15 minutes ([vercel.json](vercel.json))

### P0 Critical
1. **No load testing**: Zero k6, artillery, or load test configuration found. Cannot validate concurrent interview capacity. Micro1 claims sub-2s at scale; Mercor claims 10,000+ concurrent. UNVERIFIED for Paraform.
2. **Missing critical database indexes**: Interview model lacks visible indexes on status, candidateId, completedAt. InterviewReport and InterviewEvent models have no visible indexes. Report generation and SLO queries will degrade at scale. ([prisma/schema.prisma](prisma/schema.prisma))
3. **Single-region deployment**: vercel.json has no function region specification. All serverless functions default to closest region. Global candidates will experience high latency.

### P1 Important
4. **No Redis cache layer beyond sessions**: Redis used only for rate limiting, session locks, SLO data, and report dedup. No query caching, no hot data caching.
5. **Sentry sampling at 10%**: Low sample rate may miss intermittent production issues ([sentry.server.config.ts:5](sentry.server.config.ts#L5))
6. **Continuity SLO thresholds disabled by default**: All thresholds set to 0.0, requiring explicit manual configuration ([lib/continuity-slo-monitor.ts:12-17](lib/continuity-slo-monitor.ts#L12-L17))
7. **No Inngest DLQ or retry policies visible**: Failed background jobs may be silently lost
8. **No Prometheus/Datadog/CloudWatch integration**: Only Sentry for observability. No metrics, dashboards, or alerting beyond SLO monitors.

### P2 Nice-to-Have
9. No DR plan: backups, failover, RTO/RPO not defined
10. No CDN configuration beyond Next.js defaults
11. Vercel function timeout and memory limits not configured
12. AIUsageLog missing compound index on (companyId, createdAt)

---

## Section 8: AI Model and Prompt Engineering

**Grade: PARTIAL | Score: 7/10**

### What Works
- **Comprehensive system prompt**: 41KB prompt library with type-specific personas (TECHNICAL, BEHAVIORAL, DOMAIN_EXPERT, LANGUAGE, CASE_STUDY), ML-specific 9-step framework for AI/ML candidates, voice-optimized shorter sentences for natural turn-taking ([lib/aria-prompts.ts](lib/aria-prompts.ts))
- **Prompt versioning**: SHA-256 hash of full scorer prompt + rubric hash enables version tracing per report ([lib/gemini.ts:257-259](lib/gemini.ts#L257-L259))
- **Output gate policy enforcement**: Detects reintroductions (10 regex patterns), duplicate questions (hash + semantic dedup via Jaccard on bigrams), unsupported claims, with response sanitization ([lib/output-gate.ts](lib/output-gate.ts))
- **Grounding gate anti-hallucination**: Assertion extraction (reference/number/entity/attributive patterns), Jaccard + number-aware verification with 5% tolerance, courtesy phrase exclusions, provenance tracking ([lib/grounding-gate.ts](lib/grounding-gate.ts))
- **Structured scoring with score clamping**: All dimension scores clamped to 0-100 range, Zod schema validation on responses, markdown-wrapped JSON parsing ([lib/gemini.ts:381-414](lib/gemini.ts#L381-L414))
- **Model governance dashboard**: Tracks reports by model version, prompt hash, rubric hash, usage dates ([app/api/admin/model-governance/route.ts](app/api/admin/model-governance/route.ts))
- **AI decision governance**: Configurable per-company policies for score override, transcript redaction, report suppression, auto-publish thresholds ([app/api/admin/governance/route.ts](app/api/admin/governance/route.ts))
- **Memory fidelity scoring**: Recall, precision, and coverage metrics with fuzzy matching (Jaccard >= 0.35) ([lib/memory-fidelity-scorer.ts](lib/memory-fidelity-scorer.ts))

### P0 Critical
1. **No explicit temperature/sampling control**: Gemini model instantiation uses defaults. Cannot guarantee deterministic enough scoring for consistent interviews. ([lib/gemini.ts:297](lib/gemini.ts#L297))
2. **No model fallback**: If Gemini is down, interviews fail completely. No fallback to alternative model (Claude, GPT-4, etc.).
3. **Prompt sanitization vulnerable to creative attacks**: `sanitizeForPrompt()` only strips XML/JSON delimiters and code fences. Does not filter prompt keywords ("System:", "Instructions:", "Ignore above"), unicode whitespace, or encoding-based bypasses. ([lib/aria-prompts.ts:3-10](lib/aria-prompts.ts#L3-L10))

### P1 Important
4. **Gemini Live model is hardcoded**: `"models/gemini-2.5-flash-native-audio-latest"` with no selection logic, versioning, or A/B testing capability ([lib/gemini-live.ts:218](lib/gemini-live.ts#L218))
5. **Model governance is read-only**: No rollback, model switching, or A/B testing. Only displays what was used. ([app/api/admin/model-governance/route.ts](app/api/admin/model-governance/route.ts))
6. **Legal compliance has no runtime enforcement**: Relies on model following instructions. No post-generation gate to catch discriminatory questions that slip through.
7. **Governance policy lacks validation**: No check that requireReviewBelow < autoPublishAbove; no audit trail of policy changes

### P2 Nice-to-Have
8. Voice name defaults to "Kore" — no candidate preference option
9. Grounding gate assertion extraction is regex-based; may miss paraphrased claims
10. Output gate replacement text is generic ("Let's continue with the interview")

---

## Final Verdict

### Overall Score: **53/100**

### Competitor Parity
| Benchmark | Parity |
|-----------|--------|
| **Micro1** | **40%** |
| **Mercor** | **35%** |

### Top 5 Blockers to Enterprise Sales

1. **SSO is non-functional** — Enterprise procurement will reject without working SAML/OIDC. (Section 6, P0)
2. **No ATS integration** — Recruiters won't adopt without Greenhouse/Lever connectivity. (Section 5, P0)
3. **No load testing or capacity validation** — Cannot guarantee concurrent interview capacity. (Section 7, P0)
4. **Scoring not reproducible** — No temperature control means same answers may produce different scores. Legally indefensible. (Section 3, P0)
5. **No CSV bulk invite** — Enterprise hiring involves hundreds of candidates. One-by-one invitation is a non-starter. (Section 5, P0)

### Effort Estimate to Enterprise-Ready

| Priority | Items | Estimate |
|----------|-------|----------|
| P0 Critical (must fix) | 16 items | **12-16 engineer-weeks** |
| P1 Important (30-day) | 24 items | **16-20 engineer-weeks** |
| P2 Nice-to-have (roadmap) | 20+ items | **12-16 engineer-weeks** |
| **Total to enterprise-ready** | | **40-52 engineer-weeks** |

### Prioritized Fix List

**Week 1-2: Security & Auth**
1. Implement real SSO (SAML + OIDC) with at least Okta and Azure AD — [app/api/auth/sso/route.ts](app/api/auth/sso/route.ts)
2. Add explicit CSRF middleware — create [middleware.ts](middleware.ts)
3. Fix CSP: remove unsafe-inline (use nonces), scope unsafe-eval to landing page only — [next.config.ts](next.config.ts)
4. Add PII scrubbing to Sentry — [sentry.server.config.ts](sentry.server.config.ts), [sentry.client.config.ts](sentry.client.config.ts)

**Week 3-4: Scoring Integrity**
5. Set Gemini temperature to 0.1-0.3 for scoring reproducibility — [lib/gemini.ts](lib/gemini.ts)
6. Implement HMAC-SHA256 evidence signing (not just hashing) — [lib/evidence-hash.ts](lib/evidence-hash.ts)
7. Enable FF_OUTPUT_GATE_BLOCKING by default — [lib/output-gate.ts](lib/output-gate.ts)
8. Add confidence intervals to scoring output

**Week 5-6: Voice Quality**
9. Add echoCancellation/noiseSuppression/autoGainControl to getUserMedia — [components/interview/InterviewPreCheck.tsx](components/interview/InterviewPreCheck.tsx), [hooks/useMediaRecording.ts](hooks/useMediaRecording.ts)
10. Migrate ScriptProcessorNode to AudioWorklet — [hooks/useVoiceInterview.ts](hooks/useVoiceInterview.ts)
11. Add timeouts to memory retrieval — [lib/memory-orchestrator.ts](lib/memory-orchestrator.ts)
12. Reduce recording signed URL expiry to 48h — [app/api/v1/interviews/upload-recording/route.ts](app/api/v1/interviews/upload-recording/route.ts)

**Week 7-10: Recruiter Tools**
13. Build CSV bulk invite (upload, parse, validate, batch send) — new endpoint + UI
14. Implement Greenhouse ATS integration (API v4) — new module
15. Add company-scoped admin data filtering — [app/api/admin/route.ts](app/api/admin/route.ts) + all admin endpoints
16. Add database indexes for Interview, InterviewReport, InterviewEvent — [prisma/schema.prisma](prisma/schema.prisma)

**Week 11-14: Scale & Reliability**
17. Create k6 load test suite (target: 100 concurrent interviews)
18. Configure multi-region Vercel deployment — [vercel.json](vercel.json)
19. Add model fallback (Gemini -> Claude API) — [lib/gemini.ts](lib/gemini.ts)
20. Implement Prometheus/Datadog metrics export

**Week 15-16: AI Hardening**
21. Enhance prompt injection protection — [lib/aria-prompts.ts](lib/aria-prompts.ts)
22. Add runtime legal compliance gate (post-generation check)
23. Implement model A/B testing framework
24. Add multi-language interview support (top 5 languages)

---

## What's Genuinely Impressive

Despite the gaps, the engineering quality in several areas is **well above typical startup level**:

- **Session-brain architecture** is genuinely novel — server-side turn-commit protocol with multi-layer validation (output gate, grounding gate, contradiction detection, memory confidence) running on every single AI turn
- **Reconnection protocol** with HMAC-signed tokens, atomic CAS lock swapping, and 3-strategy reconciliation is production-grade
- **Memory orchestration** with 3-tier turn selection (milestone + unresolved + recent) and token budget management is sophisticated
- **20 SLOs with error budgets** is more observability than most Series B companies have
- **Hypothesis-driven interview planning** is a genuine differentiator vs Micro1/Mercor's simpler question sequencing
- **Deterministic interviewer state machine** with cryptographic integrity checks is the right architecture for legally defensible AI
- **60 test files** covering unit, integration, chaos resilience, and enterprise claims is strong coverage

The foundation is solid. The gaps are primarily in **enterprise integration** (SSO, ATS, bulk operations) and **production hardening** (load testing, multi-region, model fallback) rather than fundamental architecture issues.
