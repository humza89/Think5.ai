/**
 * OpenTelemetry-backed Telemetry (Phase 0 T12), implementing the T0.5 contract.
 *
 * Uses only `@opentelemetry/api`: when no SDK is registered (local dev,
 * unit tests, CI without an exporter) every call is a cheap no-op; when
 * instrumentation.ts registers @vercel/otel the same calls produce real
 * spans and metrics exported over OTLP. Application code depends on the
 * contract, never on a vendor SDK.
 */
import { metrics, trace, SpanStatusCode, type Attributes as OtelAttributes, type Span as OtelSpan } from "@opentelemetry/api";
import type { Attributes, Span, SpanStatus, Telemetry, TelemetryContext } from "@/lib/contracts/telemetry";
import { getRequestContext } from "@/lib/request-context";

export const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "think5-web";

function contextAttributes(context: TelemetryContext): OtelAttributes {
  const out: OtelAttributes = {};
  if (context.requestId) out["think5.request_id"] = context.requestId;
  if (context.interviewId) out["think5.interview_id"] = context.interviewId;
  if (context.tenantId) out["think5.tenant_id"] = context.tenantId;
  return out;
}

function mergeContext(base: TelemetryContext, extra: TelemetryContext): TelemetryContext {
  const merged: TelemetryContext = { ...base };
  for (const key of ["requestId", "interviewId", "tenantId"] as const) if (extra[key] !== undefined) merged[key] = extra[key];
  return merged;
}

export class OtelTelemetry implements Telemetry {
  private readonly tracer = trace.getTracer(SERVICE_NAME);
  private readonly meter = metrics.getMeter(SERVICE_NAME);

  constructor(readonly context: Readonly<TelemetryContext> = {}) {}

  /** Context = explicit context merged over the ambient request context. */
  private effectiveContext(): TelemetryContext {
    return mergeContext(getRequestContext(), this.context);
  }

  startSpan(name: string, attributes: Attributes = {}): Span {
    const span: OtelSpan = this.tracer.startSpan(name, { attributes: { ...contextAttributes(this.effectiveContext()), ...attributes } });
    let ended = false;
    return {
      name,
      setAttribute: (key, value) => span.setAttribute(key, value),
      recordException: (error) => span.recordException(error instanceof Error ? error : new Error(String(error))),
      end: (status: SpanStatus = "ok") => {
        if (ended) return;
        ended = true;
        span.setStatus({ code: status === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK });
        span.end();
      },
    };
  }

  counter(name: string, value = 1, attributes: Attributes = {}): void {
    this.meter.createCounter(name).add(value, { ...contextAttributes(this.effectiveContext()), ...attributes });
  }

  histogram(name: string, value: number, attributes: Attributes = {}): void {
    this.meter.createHistogram(name).record(value, { ...contextAttributes(this.effectiveContext()), ...attributes });
  }

  withContext(context: TelemetryContext): Telemetry {
    return new OtelTelemetry(mergeContext(this.context, context));
  }
}

let defaultTelemetry: Telemetry | null = null;

/** Process-wide Telemetry for app code. */
export function getTelemetry(): Telemetry {
  if (!defaultTelemetry) defaultTelemetry = new OtelTelemetry();
  return defaultTelemetry;
}

export function setTelemetryForTests(telemetry: Telemetry | null): void {
  defaultTelemetry = telemetry;
}

/** True when an OTLP endpoint is configured; instrumentation.ts registers the SDK only then. */
export function otelExportConfigured(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
}
