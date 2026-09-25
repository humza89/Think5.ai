# Observability: correlation ids and OpenTelemetry (Phase 0 · T12)

Status: **foundation merged, export not yet enabled.** Everything below works
with no backend configured (the OpenTelemetry API is a no-op until an SDK is
registered). Turning on export is a configuration change, not a code change.

## What is in the code

| Piece | Where | Behaviour |
| --- | --- | --- |
| Request id | `proxy.ts` | Every request gets an `x-request-id` (incoming value kept when it matches `[A-Za-z0-9._-]{8,128}`, otherwise a UUID). The id is echoed on every response, including rejected ones. |
| Request context | `lib/request-context.ts` | `AsyncLocalStorage` holding `requestId`, `interviewId`, `tenantId`. `runWithRequestContext()` scopes a handler; `supportId()` builds the short id shown to users. |
| Logger correlation | `lib/logger.ts` | `logger.info/warn/error/debug` merge the ambient ids into every line (explicit extras win). |
| Telemetry contract impl | `lib/otel.ts` | `OtelTelemetry` implements the T0.5 `Telemetry` contract on `@opentelemetry/api`; spans and metrics carry `think5.request_id`, `think5.interview_id`, `think5.tenant_id`. `getTelemetry()` is the process-wide instance. Passes `runTelemetryConformance`. |
| SDK registration | `instrumentation.ts` | Registers `@vercel/otel` (`serviceName` from `OTEL_SERVICE_NAME`, default `think5-web`) **only when** `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. Sentry stays for error capture. |
| Interview routes | `voice-init`, `voice` | Run inside `runWithRequestContext({ requestId, interviewId })`, so their logs and telemetry are correlated. Other routes pick up the header through the proxy and can adopt the same wrapper as they are touched. |
| Browser | `hooks/useVoiceInterview.ts` | Captures `x-request-id` from the voice-init response, sends it to the relay as `?rid=` on the WebSocket URL, and accepts the relay's `relay.hello` frame. Exposes `lastRequestId`. |
| Relay | `relay/server.ts` | Reads `rid` from the handshake query (fallbacks: `x-request-id` header, `traceparent` trace-id), validates the charset, tags the Sentry scope with `request_id`, appends `rid=` to every per-connection log line, and sends `{ type: "relay.hello", interviewId, requestId }` as the first control frame. |
| Support ID | `app/interview/[id]/page.tsx`, `VoiceInterviewRoom.tsx` | The room error card shows `Support ID: <interview 8>-<request 8>`; voice error toasts carry the same id in their description. |

A Support ID such as `cmg1abcd-5f2c1d9e` resolves to: interview id prefix
`cmg1abcd…` and request id prefix `5f2c1d9e…`. Search Grafana Traces for
`span.think5.request_id =~ "5f2c1d9e.*"`, Sentry for tag `request_id`, and the
relay logs for `rid=5f2c1d9e`.

## Enabling export to Grafana Cloud (external gate)

Owner action required; nothing in the repo can be verified live until it is done.

1. Create (or reuse) a Grafana Cloud stack. In **Connections → OpenTelemetry (OTLP)** copy the OTLP gateway URL and create an access policy token with `metrics:write`, `traces:write`, `logs:write`.
2. In Vercel → Project → Environment Variables (Production first, Preview once staging is happy) set:
   - `OTEL_EXPORTER_OTLP_ENDPOINT` = the gateway URL (ends in `/otlp`)
   - `OTEL_EXPORTER_OTLP_HEADERS` = `Authorization=Basic <base64(instanceId:token)>`
   - `OTEL_EXPORTER_OTLP_PROTOCOL` = `http/protobuf`
   - `OTEL_SERVICE_NAME` = `think5-web`
   - `OTEL_RESOURCE_ATTRIBUTES` = `deployment.environment=production` (or `preview`)
3. Redeploy. Within a few minutes **Explore → Traces** should show `service.name = think5-web` server spans for `/api/**`; **Explore → Metrics** should show `traces_spanmetrics_calls_total{service_name="think5-web"}` once span metrics are enabled on the Traces tenant (Grafana Cloud → Traces → Metrics generator).
4. Import the dashboards under `docs/ops/grafana/*.json` (Dashboards → New → Import, map `DS_PROMETHEUS` to the stack's Mimir data source and `DS_TEMPO` to Tempo).
5. Sentry and OTel side by side: the Sentry Next.js SDK also uses OpenTelemetry. When export is enabled, add to `sentry.server.config.ts` `skipOpenTelemetrySetup: true` and register Sentry's span processor and propagator through `registerOTel({ spanProcessors: ["auto", new SentrySpanProcessor()], propagators: ["auto", new SentryPropagator()] })` so both receive spans and `trace_id` links Sentry events to Grafana traces. This step is deliberately left until the endpoint exists, because it cannot be validated without a live collector.

Nothing above requires code changes to the application; the app depends only on the `Telemetry` contract and `@opentelemetry/api`.

## Dashboards (`docs/ops/grafana/`)

| File | Covers | Data available today |
| --- | --- | --- |
| `web.json` | Route request rate, 5xx ratio, p95/p99 latency, top error routes, slow-trace search | As soon as export is on (span metrics from `@vercel/otel` HTTP server spans). |
| `relay.json` | Active connections, connect rate, Gemini reconnects/failures, buffer overflows, throughput, drain events, share of sessions carrying a request id | **Not yet.** Series names are the ones the relay's Node OTel SDK will emit (`relay_*`). Until then the same counters are on the relay's `/health` JSON; scrape it with Grafana Alloy's `prometheus.exporter.json` if needed before the SDK lands. |
| `queues.json` | Inngest run rate, scheduling lag, retries, failed (dead-lettered) runs, backlog, `/api/inngest` p95 on Vercel | Vercel panel: as soon as export is on. Inngest panels require Inngest's Prometheus metrics export (Pro/Enterprise), scraped into the stack. |
| `providers.json` | Provider call rate, error ratio and p95 from outbound fetch spans; tokens and cost from the usage ledger; budget-gate decisions | Spans: as soon as export is on. Usage counters: once T16's `PrismaUsageMeter` is constructed with `getTelemetry()` (follow-up noted in T16). |
| `interview.json` | voice-init p95, turn-commit p99, started vs completed, completion rate, degraded-mode rate, per-interview trace lookup | Latency/error panels: as soon as export is on. Started/completed: T16 counters. Degraded-mode: T11 counter `interview_degraded_total`. |

Panels that depend on a later task say so in their description so nobody reads an empty graph as "zero".

## Relay OpenTelemetry SDK (deferred, tracked)

The plan asks the relay to run the Node OTel SDK with `serviceName: "think5-relay"`. `relay/node_modules` is currently committed to the repository (T13 removes it). Adding `@opentelemetry/sdk-node` + OTLP exporters before T13 would commit several megabytes of vendored dependencies. The relay change is therefore split: correlation (this task) now; SDK registration in the T13 hygiene PR, with the same env vars and `OTEL_SERVICE_NAME=think5-relay` set on Fly (`fly secrets set`). The `relay.json` dashboard is already written against the metric names that SDK will emit.

## Logs via OTLP

Follow-up per the plan: once the collector is in place, ship structured logs (the `logger` already carries the correlation ids) through the OTLP logs endpoint; until then Vercel/Fly log drains remain the log path.

## Verification performed

- `__tests__/lib/request-context.test.ts`: scoping, nesting, isolation across concurrent scopes, header read, Support ID format.
- `__tests__/lib/otel-telemetry.test.ts`: `OtelTelemetry` passes `runTelemetryConformance`; explicit context beats ambient context on spans, counters and histograms; span end-once and error status; singleton swap; export-configured check.
- `__tests__/lib/logger-correlation.test.ts`: ids on every level; explicit extras win; unchanged output outside a request.
- `npx tsc --noEmit` (web and relay), `npm run lint`, `npx vitest run`, `npm run manifest:check` unchanged.
- Not verified: live export to Grafana Cloud (no token; see the gate above).
