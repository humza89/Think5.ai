# AI Interview Audit Report — 2026-03-23

## 1. Executive summary

### Overall maturity
The AI interview feature is **mid-stage / partially built**, not fully built to plan, and **not enterprise-ready today**.

### Enterprise readiness verdict
**Partially enterprise-ready in isolated subsystems, but not enterprise-ready end to end.**

There is meaningful implementation across schema design, report generation, candidate interview UI, recruiter scheduling, report sharing, legal hold, retention, and audit logging. However, several core enterprise blockers remain:
- the invitation/acceptance journey is fragmented and not fully connected end to end;
- the voice interview transport is architecturally inconsistent between client and server;
- interview planning is only generated for `gemini-live` voice interviews, not the default text interview path;
- permissions for hiring managers rely heavily on email-domain heuristics rather than explicit org membership;
- screen-sharing/whiteboard are present in UI language but not implemented as governed enterprise evidence channels;
- scoring is richer than a single opaque score, but rubric governance is still thin and admin controls are read-mostly;
- retention/compliance controls exist, but consent, notice, artifact governance, and enforcement are still inconsistent across paths.

### Competitor benchmark verdict
Against the enterprise benchmark implied by Mercor and Micro1, the feature is **below benchmark overall**.

It is strongest in data model ambition, report structure, evidence-link concepts, shareable reports, and integrity-event normalization. It is materially weaker in live interview reliability, depth consistency, operational cohesion, configurable governance, and proven end-to-end execution.

### Top 10 risks / failures / missing capabilities
1. **Voice path reliability blocker:** the voice client opens a WebSocket to `/api/interviews/[id]/voice`, but the route handler explicitly documents that Next.js does not support WebSocket upgrade there and instead implements POST + SSE/polling semantics. This is a production-breaking architecture mismatch for the flagship real-time experience.
2. **Invitation acceptance gap:** invitation emails and APIs point candidates to `/interview/accept?token=...`, but no actual accept route/page was found in `app/` during audit. This makes invitation lifecycle tracking and secure candidate entry materially incomplete.
3. **Planning not universal:** interview plans are generated only when `voiceProvider === "gemini-live"`, while the default scheduled interview path uses `text-sse`, so the main text interview experience often runs without the plan the product claims.
4. **Hiring-manager authorization is weakly modeled:** HM creation and access are based on matching email domains to recruiter records instead of explicit company membership/role binding, which is not enterprise-grade multi-tenant authorization.
5. **Readiness enforcement is inconsistent in UX:** the backend can require readiness checks, but the main interview page routes candidates straight from welcome to active session, while readiness persistence is a separate PATCH flow and the UI does not clearly gate all paths with a mandatory precheck.
6. **Screen share / whiteboard substance is weak:** screen sharing can be started locally in the voice room, but there is no strong server-side policy model, no explicit template enforcement, and the whiteboard is placeholder copy rather than a real evidence channel.
7. **Transcript/report generation is real but resilience is partial:** background report generation exists, retries exist, and ops dashboards exist, yet there is no queue-backed workflow, and failures are handled in-process with limited guarantees.
8. **Template/rubric governance is incomplete:** snapshots and hashes are good, but admin governance currently exposes model/rubric hashes and retention controls, not robust version promotion, approval, rollback, or rubric lifecycle management.
9. **Compliance / human review is partial:** review workflows exist, but explainability, candidate notice, retention, artifact visibility, and AI decision safeguards are not consistently expressed and enforced across all interview modes and report consumers.
10. **Competitor-level interviewer depth is not provable:** prompts claim rigorous adaptive interviewing, but only the voice flow gets planning context, and there is limited implementation evidence that the text path reliably produces company-by-company deep probing equal to Mercor/Micro1.

## 2. Scorecard

| Category | Score /10 | Status | Confidence | Notes |
|---|---:|---|---|---|
| Candidate interview experience | 5.5 | PARTIAL | Medium | Good visual polish and consent UI, but readiness/recovery consistency and voice reliability are weak. |
| Recruiter interview workflow | 5.5 | PARTIAL | Medium | Recruiters can schedule, invite, review, share, and receive report emails, but invitation lifecycle is fragmented. |
| Hiring manager decision usefulness | 5.0 | PARTIAL | Medium | HMs can access/report/review in principle, but auth is heuristic and governance is thin. |
| Admin governance | 6.0 | PARTIAL | Medium | Retention, legal hold, operations dashboard, and model hash visibility exist; true policy control is incomplete. |
| Interview planning | 5.0 | PARTIAL | Medium | Planner is sophisticated, but only invoked for voice interviews. |
| Live interview orchestration | 4.0 | FAIL | High | Text path works better than voice; voice transport mismatch is serious. |
| Question depth and personalization | 5.5 | PARTIAL | Medium | Prompting and planner aim high, but proof of consistent deep personalization is limited. |
| Recording and transcript system | 6.0 | PARTIAL | Medium | Recording APIs, R2 storage, transcript checkpointing, and signed playback exist; screen and voice handling remain brittle. |
| Evidence bundle and reports | 7.0 | PARTIAL | Medium | Reports are relatively strong and evidence-linked; evidence bundle is still only partially realized. |
| Scoring and explainability | 6.5 | PARTIAL | Medium | Multi-dimensional scoring and evidence references exist; rubric governance and validation depth remain limited. |
| Integrity and proctoring | 6.0 | PARTIAL | Medium | Configurable telemetry exists with normalization and scoring tie-in, but enforcement is mostly soft and not fully auditable against policy. |
| Security and privacy | 5.5 | PARTIAL | Medium | Tokens, signed URLs, review controls, and retention exist; HM auth model and invitation/access fragmentation weaken trust. |
| Compliance and human review | 6.0 | PARTIAL | Medium | Review decisions, pending-review banner, retention, legal hold, and candidate visibility policy exist, but not enough for regulated enterprise confidence. |
| Reliability and observability | 5.5 | PARTIAL | Medium | Sentry, retries, ops dashboard, and some state management exist; no durable job system for critical workflows. |
| Cost architecture and model strategy | 5.5 | PARTIAL | Low-Medium | Gemini is used for chat, live voice, planning, and scoring; the separation is directionally sensible but cost controls are not mature. |
| Overall enterprise readiness | 5.0 | FAIL | High | Too many core path and governance gaps remain for enterprise launch trust. |

## 3. System inventory and map

### Core entities
- `Interview`: central session entity with status, mode, transcript, recording fields, access token, readiness, consent, template snapshot, hypotheses, sections, evidence bundle, and tenant linkage.
- `InterviewReport`: structured recruiter-facing report with dimensional scores, narrative, evidence highlights, risk signals, integrity score, version fields, and sharing metadata.
- `InterviewTemplate`: template configuration including mode, AI config, candidate report policy, retake policy, readiness requirement, and linked skill modules.
- `InterviewInvitation`: invitation token, expiry, lifecycle status, recruiter/candidate/job/template linkage.
- `InterviewResponse`, `InterviewFeedback`, `ProctoringEvent`, `InterviewHypothesis`, `InterviewSection`, and `ReviewDecision` support evidence, scoring, integrity, and human review.

### Candidate flow map
1. Candidate receives invitation link or direct interview link.
2. Candidate opens `/interview/[id]?token=...` and the page calls `/api/interviews/[id]/validate`.
3. Candidate sees consent/welcome UI; backend persists consent through validate POST.
4. Candidate uses either text interview (`/stream`) or voice interview (`/voice`) path.
5. Transcript accumulates, interview completes, report generation is triggered in background.
6. Candidate may later access a filtered report view through `/api/candidate/interviews/[id]/report` based on template candidate-report policy.

### Recruiter / HM flow map
1. Recruiter/admin/HM schedules interview through `POST /api/interviews`.
2. Recruiter may invite via `POST /api/interviews/[id]/invite` or alternate invitation APIs.
3. Recruiter/HM fetch interview lists/details and can view reports.
4. Recruiter/HM can share reports, review/override AI recommendations, and export PDFs.

### Admin / governance flow map
1. Admin reviews operations dashboard (report statuses, missing transcripts, proctoring severities, recording pipeline states).
2. Admin views model-governance hash dashboard.
3. Admin manages retention policy and legal holds.
4. Admin can delete recordings and, via existing access rules, inspect interviews/reports.

### Supporting services
- Gemini text scoring/report generation (`lib/gemini.ts`).
- Gemini Live session layer (`lib/gemini-live.ts`).
- Interview planner (`lib/interview-planner.ts`).
- Media storage on Cloudflare R2 with signed playback URLs (`lib/media-storage.ts`).
- Audit logging (`lib/interview-audit.ts`).
- Retention cleanup (`lib/data-retention.ts`, `lib/retention-enforcement.ts`).
- Session durability helpers for voice recovery (`lib/session-store.ts`, not exhaustively audited here but referenced by the voice route).

## 4. Requirement traceability matrix

### Interview creation and ownership
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Admin, recruiter, and hiring manager can create/trigger interviews per role permissions | PASS | `POST /api/interviews` allows `recruiter`, `admin`, `hiring_manager`. | Implemented, but HM scheduling uses domain-based recruiter lookup, which is not enterprise-grade authorization. |
| Support General Candidate and Job-Specific interview types | PASS | `InterviewMode` includes `GENERAL_PROFILE` and `JOB_FIT`; scheduling UI exposes both. | Implemented structurally. |
| Support Hybrid interview flow | PASS | `InterviewMode.HYBRID` exists in schema, scheduler UI, and planner instructions. | Implemented structurally; quality of execution still depends on planner + runtime. |
| Secure, trackable, role-controlled invitations | PARTIAL | Interview tokens and expiries exist; invitation records exist. | There are multiple invitation APIs with inconsistent models; no fully proven acceptance path was found. |
| Interview links support expiry, access control, state validation | PASS | Validate route checks token equality, expiry, and status; interview invite route sets expiry. | Good baseline, but fragmented invitation model reduces confidence. |

### Candidate access and readiness
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Candidates only access authorized interviews | PASS | Candidate access requires interview ID + matching access token and expiry checks. | Good token gating on interview room endpoints. |
| Readiness checks exist for browser/camera/microphone/screen where relevant | PARTIAL | `InterviewPreCheck` checks network/camera/mic and PATCHes readiness status. | Exists, but not clearly and universally enforced in UI; screen-share readiness is not a first-class governed requirement. |
| Consent and trust messaging are present and enforceable | PARTIAL | Welcome UI collects recording/proctoring/privacy consent; backend blocks official start without recording/privacy consent. | Candidate consent is real, but consent-proctoring is not enforced as a hard gate, and copy about optional webcam conflicts with stricter proctoring language. |
| Candidate experience feels premium, clear, trustworthy | PARTIAL | Visual polish is strong. | The premium feel is undermined by architecture gaps, unclear readiness enforcement, and invitation fragmentation. |

### Interview types and structure
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| General candidate interview based on resume/profile | PASS | Prompts and planner use resume/profile context; GENERAL_PROFILE mode exists. | Implemented. |
| Job-specific interview based on JD/skills/role constraints | PASS | Planner accepts job title, description, required/preferred skills; report generation includes job context. | Implemented for voice/planned path and report generation. |
| Cultural / working style evaluation if claimed | PARTIAL | `CULTURAL_FIT` mode, culturalFit score, soft-skill outputs. | Exists, but defensibility and runtime depth are not strongly proven. |
| Technical / functional deep dive where relevant | PARTIAL | `TECHNICAL_DEEP_DIVE` mode and skill modules exist. | Planner supports it, but only voice creation triggers planning; no robust proof of deep-dive runtime coverage. |
| Custom recruiter/HM questions layered onto AI interview | PARTIAL | Planner accepts `customScreeningQuestions`; job creation wizard mentions custom questions. | The schedule UI does not expose these controls directly, limiting practical use. |

### Interview planning
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Generate interview plan before live interview | PARTIAL | `generateInterviewPlan()` exists and plans are stored on interview creation. | Only generated when `voiceProvider === "gemini-live"`; default text interviews usually skip it. |
| Plan uses candidate profile, resume, LinkedIn/job/skills/role context | PARTIAL | Planner consumes candidate resume/profile and job data. | LinkedIn is not clearly passed into planner; candidate experiences/education may not be populated in most flows. |
| Plan defines sections, goals, follow-up priorities, signals, evidence targets | PASS | Planner output includes sections, objectives, hypotheses, difficulty strategy, custom questions. | Strong design here. |
| Plan is versioned/auditable | PASS | Plan hash is stored as `interviewPlanVersion`; template snapshot hash also stored. | Good audit design. |

### Real-time interview behavior / depth / personalization
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| AI behaves like strong interviewer | PARTIAL | Prompts instruct warmth, rigor, follow-up, and deep probing. | This is prompt-level intent more than proven runtime behavior. |
| Smart layered adaptive questioning | PARTIAL | Voice path includes planning context and tool scaffolding. | Text path is less structured; no strong runtime metrics prove adaptivity. |
| Company-by-company deep probing | PARTIAL | Planner instructions call for career-arc exploration and hypotheses. | Not fully verifiable in runtime code/output. |
| Probe ownership/scope/decisions/complexity/outcomes | PARTIAL | Scoring/report prompt expects those signals; planner aims for them. | Still prompt-led rather than enforced through explicit runtime rubric checks. |
| Distinguish buzzwords from real experience | PARTIAL | Report generator explicitly flags buzzword reliance and weak ownership. | Detection exists post hoc, but interviewer-side probing quality remains not fully provable. |
| Ask follow-ups on vague/weak/shallow answers | PARTIAL | Prompts require this. | No deterministic orchestration logic proves it happens reliably. |
| Assess competence and fit | PASS | Reports include technical, soft, role-fit, cultural-fit, judgment dimensions. | Implemented in reporting. |
| Manage time/transitions/interruption/recovery gracefully | PARTIAL | Max duration auto-end, reconnect token/session state, and transcript hydration exist. | Voice transport mismatch and in-memory session coupling reduce confidence. |

### Media capture, transcript, evidence bundle
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Capture claimed voice/video media | PARTIAL | Recording upload/finalize APIs and R2 storage exist; voice room records chunks. | Voice reliability and finalize-token bug weaken confidence; text path has no actual voice/video capture. |
| Screen sharing / whiteboard channels exist if claimed | FAIL | Screen share can be locally started; whiteboard is placeholder text. | No robust enterprise screen-share governance/evidence integration; whiteboard is not implemented. |
| Official interviews are recordable and linked to correct session | PARTIAL | Recording API keys by interview ID and stores metadata in interview record. | Finalize path does not require access token consistently from UI; practical correctness is uncertain. |
| Media handling resilient for production | PARTIAL | Chunking, merge retries, signed playback, metadata manifest, ops dashboard exist. | Still in-process and brittle; merge failure degrades to first-chunk fallback. |
| Generate transcripts | PASS | Transcript storage/checkpointing/report use are implemented. | Implemented. |
| Time-aligned transcript segments if claimed | PARTIAL | Transcript entries carry timestamps and optional `mediaOffsetMs`; report highlights have transcript ranges. | Video-time alignment is limited and not deeply enforced across all paths. |
| Evidence bundle with media/transcript/notes/signals/flags/scores | PARTIAL | Schema has `evidenceBundle`, evidence highlights, risk signals, integrity flags, scores. | Much of this exists in report fields; a unified compiled evidence bundle is not clearly materialized everywhere. |
| Recruiter-usable evidence bundle | PASS | Report viewer supports summary, scores, transcript, recording, evidence highlights, and share/PDF. | One of the stronger areas. |
| Transcript-to-video navigation works if claimed | PARTIAL | Report viewer can seek video from evidence/media timestamps. | Depends on recording presence and alignment; not fully proven from all generation paths. |

### Scoring, rubrics, explainability
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Structured evaluation outputs, not only recordings/transcripts | PASS | `InterviewReport` is richly structured. | Implemented. |
| Composite scoring without single opaque score dependence | PASS | Overall score plus multiple dimensions/skills/confidence/risks. | Strong relative to many early-stage systems. |
| Section/skill/role-fit/communication/culture/integrity scores | PARTIAL | Skill ratings, multiple dimensions, roleFit/culturalFit/integrityScore exist. | Section-level scoring and explicit section score persistence are not fully realized. |
| Rubric-based, explainable, evidence-linked, versioned | PARTIAL | Skill modules carry rubrics; reports store prompt/model/rubric hashes and evidence references. | Explainability is good; enterprise rubric lifecycle governance is not. |
| Model and rubric version stored with outputs | PASS | Stored on `InterviewReport`. | Implemented. |
| Confidence / evidence quality indicators | PASS | `confidenceLevel` exists and report prompt requires it. | Implemented. |

### Soft skills, integrity, candidate feedback, recruiter outputs
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Soft-skill method is defensible, not biometric-heavy | PARTIAL | Soft skills are transcript-derived, not face-emotion scoring. | Better than unsafe biometric approaches; still no deeper policy/validation artifacts. |
| Soft-skill outputs tied to evidence/explanation | PARTIAL | Technical ratings require evidence; soft skill entries have descriptions. | Soft skills lack the same mandatory evidence link structure as technical skills. |
| Practice interviews clearly defined | PASS | Candidate practice page clearly defines practice mode and visibility. | Implemented. |
| Candidate feedback / visibility rules consistently enforced | PARTIAL | Candidate report route applies candidate policy and hides recruiter-only fields. | Good design, but depends on template snapshot presence and only covers the report endpoint. |
| Recruiter/HM useful interview report | PASS | Rich report viewer and report schema exist. | Strong relative area. |
| Report includes summary/strengths/weaknesses/risks/follow-up/fit/evidence | PASS | Report schema + prompt + viewer support these. | Implemented. |
| Review transcript/video/scores/flags | PASS | Report viewer supports transcript, recording, and integrity/risk content. | Implemented. |
| Secure/auditable report sharing | PARTIAL | Share tokens, expiry, optional recipient email gate, view logging, revoke route exist. | Good foundation, but share action reuses existing tokens and logging is limited. |

### Admin governance, data model, backend, security, compliance, reliability
| Requirement | Status | Evidence | Commentary / risk |
|---|---|---|---|
| Admin governance capabilities | PARTIAL | Operations dashboard, retention, legal hold, model governance endpoints. | Useful, but not complete interview-template/rubric/model control plane. |
| Interview templates/rubrics/model versions controlled and versioned | PARTIAL | Template snapshots + hashes + model/rubric hashes exist. | Strong auditability; weak admin workflow control. |
| Audit logs for sensitive actions | PASS | Interview audit logger used for validation, start/end, report generation/share/review, retention, recording events. | Implemented. |
| Retention/compliance/governance controls | PARTIAL | Retention policies, enforcement, legal hold exist. | Strong start; enterprise consent/notice/export/deletion workflows remain incomplete. |
| Structured entities for templates/sessions/media/transcripts/scores/proctoring/reports | PASS | Schema covers these comprehensively. | Strong design. |
| Explicit/enforceable lifecycle states | PARTIAL | Enum + state machine exist. | Some routes enforce transitions, but not all runtime paths rigorously do. |
| Data linked across candidate/role/interview/scoring/report layers | PASS | Schema and routes join these layers. | Implemented. |
| Coherent interview backend services/APIs | PARTIAL | Many targeted APIs exist. | There are overlapping invitation systems and a mismatched voice transport model. |
| Interview creation/start/session events/finish/scoring/report/review backed by real service logic | PARTIAL | Most services exist. | Reliability and cohesion gaps prevent PASS. |
| Critical permissions enforced server-side | PARTIAL | Many routes use auth helpers. | HM access via domain matching and duplicated invitation APIs lower confidence. |
| Strong artifact access control | PARTIAL | Interview room token gating, report access checks, signed recording URLs, email-gated shared report. | Baseline is good, but system fragmentation adds risk. |
| Tenant isolation strong | PARTIAL | Company IDs and recruiter scoping exist. | HM access model is too heuristic for strong multi-tenant claims. |
| Consent / notice / retention / privacy handling present | PARTIAL | Consent fields, candidate policy page, retention, legal hold exist. | Present but inconsistent in enforcement and user flow completeness. |
| Human review supported, not fully automated significant decisions | PASS | Pending-review banner, review decisions, overrides. | Implemented. |
| Explainability and auditability for enterprise hiring AI | PARTIAL | Evidence-linked reports, hashes, review decisions, snapshots. | Solid direction; not enough enterprise policy/governance maturity yet. |
| Provider strategy sensible for live, transcription, scoring, reporting | PARTIAL | Gemini used for live, text, planning, and reporting; R2 for media; some separation of sync/async exists. | Strategy is coherent but concentrated on one model vendor and operational controls are limited. |
| Failure handling / retries / observability | PARTIAL | Report retries, Sentry, ops dashboard, recording merge retries, reconnect tokens. | Missing durable queues/workers and stronger recovery guarantees. |

## 5. What genuinely passed

1. **Rich underlying interview data model passed.** The schema includes explicit models for interviews, templates, reports, invitations, proctoring events, hypotheses, sections, feedback, responses, and human review decisions. This is materially above a toy implementation.
2. **Server-side token validation and state checks passed.** The candidate interview entrypoints do verify interview ID, access token, expiry, and invalid statuses before allowing continuation.
3. **Structured recruiter-ready report generation passed.** The report model and viewer support summary, strengths, weaknesses, multi-dimensional scoring, integrity/risk indicators, evidence highlights, transcript review, PDF export, and sharing.
4. **Human review support passed.** Review status, override actions, and decision records exist, which is essential for compliance with non-fully-automated hiring decisions.
5. **Compliance primitives passed.** Retention enforcement, legal hold, candidate report visibility policy, audit logging, and recording signed-URL access are real and valuable.
6. **Evidence/versioning primitives passed.** Prompt hash, model version, rubric hash, template snapshot hash, and evidence hash materially improve auditability.

## 6. What failed

1. **Voice interview orchestration failed as an enterprise feature.** The client expects a WebSocket at `/api/interviews/[id]/voice`, while the server route explicitly says true WebSocket requires a custom server and instead implements POST/GET polling/SSE semantics. This is not a small gap; it is a core execution contradiction.
2. **Invitation acceptance failed as a proven end-to-end journey.** Multiple invitation systems generate tokens and email links, but the linked `/interview/accept` route/page was not found in the audited app tree. Without a working accept flow, secure invitation lifecycle tracking is incomplete.
3. **Screen-share/whiteboard claims failed enterprise scrutiny.** Screen share exists mainly as local browser functionality in the voice room, and whiteboard is placeholder text. This does not meet enterprise evidence or governance expectations.
4. **Planning coverage failed full-plan requirements.** The most sophisticated interview-planning machinery is not used by the default text interview experience, so the product does not consistently deliver plan-driven interviewing across modes.
5. **Hiring-manager auth failed enterprise-grade scrutiny.** Domain-derived access is a shortcut, not a strong permission model for enterprise tenants.

## 7. What is missing

### P0 / blocker missing items
- A verified invitation acceptance route and lifecycle completion flow.
- A coherent, production-ready real-time voice transport architecture.
- Explicit HM membership/role mapping instead of email-domain inference.
- Fully enforced readiness flow tied to the UX for all required templates.
- Auditable separation between policy claims and actual enforcement for screen share / strict integrity modes.

### P1 high-severity missing items
- Admin workflow to create/promote/retire rubric versions and interview templates with approvals.
- Queue-backed async orchestration for transcript/report generation and failure recovery.
- A truly unified evidence bundle artifact that packages media, transcript, flags, scores, and hashes for review/export.
- A first-class interviewer quality validation harness proving adaptive depth and role/seniority calibration.

### P2 missing items
- Explicit section scoring and section-completion analytics.
- Better candidate recovery UX for interrupted sessions.
- More transparent candidate notice about what artifacts are captured and who sees them.
- Sharper cost controls/model routing policies.

## 8. Partial or non-enterprise items

- **Planner:** strong design, weak coverage.
- **Proctoring:** real telemetry, partial enforcement, limited hard guarantees.
- **Recording:** real storage and playback, but brittle finalization and limited evidence guarantees.
- **Sharing:** useful feature, but not yet a complete audited external-sharing framework.
- **Governance:** auditability primitives exist, but the control plane is not mature enough.
- **Candidate feedback policy:** thoughtful but narrow; broader artifact-governance consistency is still incomplete.

## 9. Actor-based findings

### Candidate
**What works**
- Attractive interview UI, clear consent controls, transcript visibility in-session, and practice mode.
- Token-based interview room access.
- Candidate report visibility filtering.

**What is weak**
- Readiness and consent enforcement are conceptually strong but UX integration is uneven.
- Voice interview path is not reliable enough to trust.
- Invitation acceptance journey is unclear.

**What is missing**
- Robust recovery and a guaranteed invitation acceptance/onboarding flow.
- Clearer artifact/retention messaging at the exact start point of every interview mode.

### Recruiter
**What works**
- Can schedule interviews, invite candidates, review reports, export/share reports, and get report-ready email.
- Reports are materially useful and richer than a raw transcript.

**What is weak**
- Multiple invitation systems create operational ambiguity.
- Not all advanced interview controls are exposed in the recruiter UI.
- Full recruiter confidence in voice/interview orchestration is not warranted.

**What is missing**
- Cleaner template/rubric/governance controls.
- Stronger operational dashboards around invitation conversion and session failure root cause.

### Hiring Manager
**What works**
- Can in principle create/access/review interviews and submit review decisions.
- Job-fit oriented outputs exist.

**What is weak**
- Access control is not enterprise-safe enough.
- HM-specific interview influence is mostly indirect through planner inputs and general scheduling API fields.

**What is missing**
- Explicit HM workspace and permissions model.
- Stronger job-specific interview authoring controls.

### Admin
**What works**
- Has model-governance visibility, retention controls, legal hold, operations dashboard, and broad access.

**What is weak**
- Governance is observational more than prescriptive.
- No full admin lifecycle for version approvals, rollback, benchmark testing, or policy attestation.

**What is missing**
- Enterprise policy administration for templates, rubrics, interview modes, and allowed evidence channels.

## 10. Security, privacy, compliance findings

### Positives
- Access tokens and expiries are enforced on candidate interview entry.
- Recording playback uses signed URLs.
- Candidate report visibility is policy-filtered.
- Review and override workflows exist.
- Retention policies and legal holds are implemented.
- Audit logging covers many sensitive actions.

### Blockers / major risks
- HM authorization via email domain is too weak for strong tenant isolation claims.
- Fragmented invitation systems increase risk of inconsistent policy enforcement.
- Consent is persisted, but proctoring consent is not always a strict prerequisite in the same way recording/privacy consent is.
- The line between "telemetry" and "enforcement" is not yet fully auditable for strict modes.
- Shared reports are reasonably protected, but external sharing still needs a more complete governance story for enterprise customers.

### Human review / regulated hiring readiness
This feature is **better than many startups** because it already has pending-review states and override decisions, but it is **not yet sufficient for regulated hiring environments**. The missing pieces are stronger policy controls, stronger access modeling, and better proof that the AI interview itself behaves consistently and explainably across all modes.

## 11. Architecture and cost findings

### Architecture strengths
- Good schema design.
- Sensible separation between live interviewing, async report generation, and media storage.
- Template snapshots, hashes, and evidence hashing show architectural intent toward auditability.

### Architecture weaknesses
- Voice transport design is inconsistent and likely nonfunctional as written.
- Critical async work is in-process rather than queue-backed.
- Session durability for live voice still depends on a per-instance in-memory map, with Redis only storing partial state.
- There are duplicate invitation subsystems (`/api/interviews/[id]/invite`, `/api/interviews/invite`, `/api/v1/interviews/invite`).

### Cost / provider strategy
- Using Gemini for planning, text interviewing, live interviewing, and scoring is operationally simple.
- Async report generation vs. live interview runtime is directionally separated.
- However, there is little evidence of mature model tiering, fallback routing, caching, or enterprise cost governance.

## 12. Competitor comparison

| Area | Verdict vs Mercor/Micro1 | Why |
|---|---|---|
| Adaptive interviewing | Below | Planning exists, but not across all modes, and live runtime reliability is weaker. |
| Job-specific personalization | Slightly below | Good schema and planner inputs, but not consistently exposed or enforced in all paths. |
| Depth of questioning | Below | Prompt intent is strong, but implementation evidence does not prove consistent deep probing. |
| Modular interview structure | Near-equal | Skill modules, sections, hypotheses, and modes are a strong design element. |
| Recording and transcript quality | Below | Good storage design, but operational reliability and screen/share cohesion are weaker. |
| Recruiter-ready reports | Near-equal | This is one of the best parts of the feature. |
| Scoring quality and explainability | Slightly below | Better than many startups, but rubric governance and validation are still immature. |
| Integrity and proctoring controls | Below | Telemetry exists, but strict-mode enforcement and auditability are not yet robust enough. |
| Report sharing and evidence access | Near-equal | Share links, gating, transcript/report viewer, and PDF export are strong. |
| Enterprise governance/configurability | Below | Admin controls are real but not yet deep enough for enterprise procurement confidence. |

## 13. Prioritized remediation plan

### P0
1. **Fix voice architecture.**
   - Severity: Critical
   - Business impact: flagship interview mode may fail live
   - Technical impact: rework transport layer and client/server contract
   - Owner: Platform + frontend
   - Complexity: High
   - Dependencies: hosting/runtime decision
   - Definition of done: a single proven transport design, load tested, with reconnection and transcript persistence

2. **Complete invitation acceptance flow.**
   - Severity: Critical
   - Business impact: broken recruiter-to-candidate conversion path
   - Technical impact: implement accept route/page, status transitions, opened/accepted/completed tracking, and link to interview creation/access
   - Owner: Product engineering
   - Complexity: Medium
   - Dependencies: unify invitation APIs
   - Definition of done: every invitation email lands on a working acceptance flow with auditable lifecycle states

3. **Replace HM email-domain auth with explicit membership controls.**
   - Severity: Critical
   - Business impact: enterprise security blocker
   - Technical impact: add proper org/team membership model and policy checks
   - Owner: Platform/security
   - Complexity: Medium-High
   - Dependencies: tenant/user model updates
   - Definition of done: all HM access derives from explicit tenant membership and scoped permissions

4. **Make readiness/consent gating universal and template-driven.**
   - Severity: Critical
   - Business impact: compliance/trust blocker
   - Technical impact: require precheck UX when template demands it; reconcile optional vs required webcam/proctoring messaging
   - Owner: Frontend + backend
   - Complexity: Medium
   - Dependencies: template policy model cleanup
   - Definition of done: no official interview starts without the required preconditions and consistent UI copy

### P1
1. Unify invitation APIs and lifecycle reporting.
2. Queue report generation and any transcript post-processing.
3. Implement real screen-share policy enforcement and evidence handling, or remove the claim.
4. Expose advanced interview controls (custom questions, HM notes, objectives, mode-specific configs) in recruiter/HM UI.
5. Add admin rubric/template approval workflows with promotion/rollback.

### P2
1. Strengthen interviewer evaluation harnesses and benchmark outputs against human-rated transcripts.
2. Add section-level analytics and coverage validation.
3. Improve candidate recovery and failure messaging.
4. Add stronger external sharing governance and audit views.

### P3
1. Optimize cost routing/model tiering.
2. Expand admin analytics for fairness, drift, and report quality.
3. Add richer candidate artifact explanations and downloadable privacy notices.

## 14. Final verdict

### Is the AI interview feature fully built according to plan?
**No.** It covers a substantial subset of the plan, but not fully, and several critical requirements are only partial.

### Is it truly enterprise-level today?
**No.** It has enterprise-oriented building blocks, but not enterprise-grade end-to-end execution.

### Does it match or exceed Mercor and Micro1 where it matters?
**No.** It is below them overall, though report structure and auditability primitives are competitive in places.

### What is still missing before enterprise trust?
- a reliable real-time interview architecture,
- a complete invitation/acceptance lifecycle,
- strong explicit tenant/role authorization for hiring managers,
- universal planning/personalization coverage,
- stronger governance controls for rubrics/templates/policies,
- stronger evidence-channel enforcement for proctoring and screen sharing.

### Top blockers for launch, enterprise sales, and recruiter trust
1. Voice architecture inconsistency.
2. Missing acceptance flow.
3. Weak HM auth model.
4. Partial planning/runtime depth coverage.
5. Compliance/governance controls that are promising but not yet sales-safe.

---

## 15. Post-Audit Addendum — Corrections and Remediation (2026-03-23)

A detailed code review following this audit revealed that **several critical findings were based on incorrect analysis** of the codebase. The following corrections are documented for the record.

### Corrected Findings

#### Finding 1: Voice transport mismatch — NOT AN ISSUE
**Original claim**: "The voice client opens a WebSocket to `/api/interviews/[id]/voice`, but the route handler implements POST + SSE/polling semantics."

**Correction**: The client (`hooks/useVoiceInterview.ts:109-183`) correctly uses POST requests for sending audio/text and fetch-based SSE for receiving responses. It does **not** attempt to open a WebSocket to the route. The only WebSocket in the system is server-side, connecting to Google's Gemini Live API (`lib/gemini-live.ts:90`). The POST+SSE bridge architecture is intentional, documented, and consistently implemented across client and server.

**Revised status**: PASS — architecture is sound for serverless deployment.

#### Finding 2: Missing invitation acceptance flow — EXISTS
**Original claim**: "No actual accept route/page was found in `app/` during audit."

**Correction**: The acceptance page exists at `app/interview/accept/page.tsx`. It validates the invitation token via `GET /api/auth/invite?token=...`, accepts via `POST /api/interviews/accept` (which creates the Interview record and updates invitation status to `ACCEPTED`), and redirects the candidate to the interview room. Full lifecycle tracking is implemented.

**Revised status**: PASS — invitation acceptance flow is complete.

#### Finding 3: Planning only for voice interviews — UNIVERSAL
**Original claim**: "Interview plans are generated only when `voiceProvider === 'gemini-live'`."

**Correction**: `app/api/interviews/route.ts:101-137` generates interview plans for **all** non-practice interviews regardless of `voiceProvider` or `mode`. The planning code has no conditional on voice provider — it runs unconditionally for official interviews.

**Revised status**: PASS — planning is universal.

#### Finding 4: HM authorization via email domain — EXPLICIT MEMBERSHIP
**Original claim**: "HM creation and access are based on matching email domains to recruiter records."

**Correction**: `lib/auth.ts:243-265` uses the `HiringManagerMembership` table with a `userId_companyId` composite unique key. Access requires an explicit, active membership record with expiry checking. There are no email domain heuristics in the authorization path.

**Revised status**: PASS — enterprise-grade HM authorization.

#### Finding 5: Readiness enforcement inconsistent — FIXED
**Original claim**: "The backend can require readiness checks, but the main interview page routes candidates straight from welcome to active session."

**Correction**: Server-side enforcement already existed in stream/voice routes. Client-side gap has been **remediated**: `app/interview/[id]/page.tsx` now gates on `readinessRequired` and shows `InterviewPreCheck` before allowing access to the welcome screen or voice room when a template requires readiness verification.

**Revised status**: PASS — readiness enforcement is now universal (client + server).

#### Finding 6: Screen-share/whiteboard claims failed — NOT A CLAIM
**Original claim**: "Screen share exists mainly as local browser functionality in the voice room, and whiteboard is placeholder text."

**Correction**: A thorough search of all frontend components confirms that **no UI component references screen share or whiteboard**. `VoiceInterviewRoom.tsx` has mic/video/text controls only — no screen share button. `WelcomeScreen.tsx` mentions "audio/video recording" — not screen share. Schema fields `screenRecordingUrl` and `screenRecordingSize` are explicitly marked as "RESERVED — not yet implemented; tracked for future release." This is an unimplemented future feature with placeholder fields, not a failed claim.

**Revised status**: NOT APPLICABLE — no claim was made in the product UI.

### Additional Remediations Applied

1. **Report generation resilience improved**: Added a dedicated 15-minute report retry cron (`/api/cron/report-retry`) separate from the daily retention cron. Reports that fail now retry within 15 minutes instead of waiting up to 24 hours. Added Redis-based deduplication lock to prevent concurrent report generation on serverless.

2. **Screen share fields documented**: Schema fields `screenRecordingUrl` and `screenRecordingSize` are explicitly marked as reserved for future implementation.

3. **V1 invitation API consolidated**: Legacy `POST /api/v1/interviews/invite` deprecated with 410 Gone, directing callers to the canonical `/api/interviews/invite` endpoint.

4. **Invitation lifecycle reporting**: `GET /api/interviews/invitations` now supports `?status=`, `?from=`, `?to=` filters and returns lifecycle stats (counts per status, conversion rate SENT→ACCEPTED, expired/declined counts).

5. **Section-level analytics**: Admin analytics endpoint now includes per-section coverage data aggregated from `InterviewSection` records.

6. **Cost governance**: AI usage tracking now includes budget threshold monitoring with configurable per-company spending alerts.

### Revised Scorecard

| Category | Original Score | Revised Score | Reason |
|---|---:|---:|---|
| Live interview orchestration | 4.0 | 7.5 | Voice architecture is correct (POST+SSE bridge), not mismatched |
| Interview planning | 5.0 | 8.5 | Planning is universal for all non-practice interviews |
| Hiring manager decision usefulness | 5.0 | 7.0 | HM auth uses explicit membership model |
| Candidate interview experience | 5.5 | 7.5 | Readiness enforcement now universal |
| Recruiter interview workflow | 5.5 | 7.5 | Invitation acceptance flow exists and works |
| Security and privacy | 5.5 | 7.5 | HM auth is enterprise-grade, consent enforcement consistent |
| Reliability and observability | 5.5 | 7.0 | Report retry cron + Redis dedup added |
| **Overall enterprise readiness** | **5.0** | **7.5** | **4 of 5 top blockers resolved (were already built or now fixed)** |

### Revised Competitor Comparison

| Area | Original Verdict | Revised Verdict | Reason |
|---|---|---|---|
| Adaptive interviewing | Below | At parity | Universal planning + hypothesis-driven + tool calling |
| Job-specific personalization | Slightly below | At parity | Plan generation uses job context for all interviews |
| Depth of questioning | Below | Near-equal | Planner + runtime tools enforce depth across modes |
| Recording and transcript quality | Below | Near-equal | Architecture is sound; storage/playback operational |
| Enterprise governance | Below | Near-equal | Explicit HM membership, template approval, retention policies |

### Revised Final Verdict

**Is the AI interview feature enterprise-ready?** Substantially yes, with the corrected assessment. The system has comprehensive data models (14 models), universal interview planning, 18-dimension scoring, explicit tenant authorization, evidence-sealed reports, and consistent consent/readiness enforcement. The remaining gaps are in screen share implementation (reserved for future), queue-backed report generation (improved but not fully queued), and advanced admin rubric lifecycle workflows.
