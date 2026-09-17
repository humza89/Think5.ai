/**
 * Telemetry contract (T0.5, implemented by T12 on OpenTelemetry → Grafana Cloud).
 *
 * Every other contract receives a `Telemetry` instance instead of importing a
 * logger, tracer or metrics vendor. Domain code therefore never depends on a
 * concrete observability library; `lib/contracts/**` is lint-guarded against
 * importing one.
 */

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

/** Correlation fields propagated through every span, counter and histogram. */
export interface TelemetryContext {
  requestId?: string;
  interviewId?: string;
  tenantId?: string;
}

export type SpanStatus = "ok" | "error";

export interface Span {
  readonly name: string;
  setAttribute(key: string, value: AttributeValue): void;
  recordException(error: unknown): void;
  /** Ends the span exactly once; later calls are ignored. */
  end(status?: SpanStatus): void;
}

export interface Telemetry {
  /** Context this instance stamps on everything it emits. */
  readonly context: Readonly<TelemetryContext>;
  startSpan(name: string, attributes?: Attributes): Span;
  counter(name: string, value?: number, attributes?: Attributes): void;
  histogram(name: string, value: number, attributes?: Attributes): void;
  /** Returns a child instance whose context is merged over this one. */
  withContext(context: TelemetryContext): Telemetry;
}

function mergeContext(base: TelemetryContext, extra: TelemetryContext): TelemetryContext {
  const merged: TelemetryContext = { ...base };
  for (const key of ["requestId", "interviewId", "tenantId"] as const) {
    const value = extra[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** Telemetry that records nothing. Safe default for code paths without wiring. */
export class NoopTelemetry implements Telemetry {
  constructor(readonly context: Readonly<TelemetryContext> = {}) {}

  startSpan(name: string): Span {
    return { name, setAttribute: () => {}, recordException: () => {}, end: () => {} };
  }

  counter(): void {}

  histogram(): void {}

  withContext(context: TelemetryContext): Telemetry {
    return new NoopTelemetry(mergeContext(this.context, context));
  }
}

export interface RecordedSpan {
  name: string;
  attributes: Attributes;
  context: TelemetryContext;
  status: SpanStatus;
  exceptions: unknown[];
  ended: boolean;
}

export interface RecordedMetric {
  name: string;
  value: number;
  attributes: Attributes;
  context: TelemetryContext;
}

/**
 * Reference implementation that keeps everything in memory. Used by the
 * conformance harness and by unit tests of code that takes a `Telemetry`.
 */
export class InMemoryTelemetry implements Telemetry {
  readonly spans: RecordedSpan[];
  readonly counters: RecordedMetric[];
  readonly histograms: RecordedMetric[];

  constructor(
    readonly context: Readonly<TelemetryContext> = {},
    sinks?: { spans: RecordedSpan[]; counters: RecordedMetric[]; histograms: RecordedMetric[] },
  ) {
    this.spans = sinks?.spans ?? [];
    this.counters = sinks?.counters ?? [];
    this.histograms = sinks?.histograms ?? [];
  }

  startSpan(name: string, attributes: Attributes = {}): Span {
    const record: RecordedSpan = {
      name,
      attributes: { ...attributes },
      context: { ...this.context },
      status: "ok",
      exceptions: [],
      ended: false,
    };
    this.spans.push(record);
    return {
      name,
      setAttribute: (key, value) => {
        record.attributes[key] = value;
      },
      recordException: (error) => {
        record.exceptions.push(error);
      },
      end: (status = "ok") => {
        if (record.ended) return;
        record.ended = true;
        record.status = status;
      },
    };
  }

  counter(name: string, value = 1, attributes: Attributes = {}): void {
    this.counters.push({ name, value, attributes: { ...attributes }, context: { ...this.context } });
  }

  histogram(name: string, value: number, attributes: Attributes = {}): void {
    this.histograms.push({ name, value, attributes: { ...attributes }, context: { ...this.context } });
  }

  withContext(context: TelemetryContext): Telemetry {
    // Children share the parent's sinks so a test can inspect one place.
    return new InMemoryTelemetry(mergeContext(this.context, context), {
      spans: this.spans,
      counters: this.counters,
      histograms: this.histograms,
    });
  }
}
