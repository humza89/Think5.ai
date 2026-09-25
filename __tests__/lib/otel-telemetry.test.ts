import { afterEach, describe, expect, it, vi } from "vitest";
import { metrics, trace } from "@opentelemetry/api";
import { runTelemetryConformance } from "@/lib/contracts/conformance/telemetry";
import { OtelTelemetry, getTelemetry, otelExportConfigured, setTelemetryForTests } from "@/lib/otel";
import { runWithRequestContext } from "@/lib/request-context";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setTelemetryForTests(null);
});

describe("OtelTelemetry (T12)", () => {
  it("passes the T0.5 Telemetry conformance harness", async () => {
    expect(await runTelemetryConformance(() => new OtelTelemetry())).toEqual([]);
  });

  it("stamps explicit context over the ambient request context on spans and metrics", async () => {
    const startSpan = vi.fn(() => ({ setAttribute: vi.fn(), recordException: vi.fn(), setStatus: vi.fn(), end: vi.fn() }));
    const add = vi.fn();
    const record = vi.fn();
    vi.spyOn(trace, "getTracer").mockReturnValue({ startSpan } as never);
    vi.spyOn(metrics, "getMeter").mockReturnValue({ createCounter: () => ({ add }), createHistogram: () => ({ record }) } as never);

    await runWithRequestContext({ requestId: "req-9", tenantId: "tenant-ambient" }, async () => {
      const telemetry = new OtelTelemetry().withContext({ tenantId: "tenant-explicit", interviewId: "int-3" });
      telemetry.startSpan("interview.turn", { turn: 2 }).end();
      telemetry.counter("turns", 1, { mode: "voice" });
      telemetry.histogram("turn_ms", 120);
    });

    const expected = { "think5.request_id": "req-9", "think5.tenant_id": "tenant-explicit", "think5.interview_id": "int-3" };
    expect(startSpan).toHaveBeenCalledWith("interview.turn", { attributes: { ...expected, turn: 2 } });
    expect(add).toHaveBeenCalledWith(1, { ...expected, mode: "voice" });
    expect(record).toHaveBeenCalledWith(120, expected);
  });

  it("ends a span once and maps the error status", () => {
    const span = { setAttribute: vi.fn(), recordException: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
    vi.spyOn(trace, "getTracer").mockReturnValue({ startSpan: () => span } as never);
    const s = new OtelTelemetry().startSpan("x");
    s.recordException("boom");
    s.end("error");
    s.end("ok");
    expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(span.setStatus).toHaveBeenCalledTimes(1);
    expect(span.setStatus.mock.calls[0][0]).toMatchObject({ code: 2 });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it("is a process-wide singleton that tests can swap", () => {
    const a = getTelemetry();
    expect(getTelemetry()).toBe(a);
    const fake = new OtelTelemetry({ tenantId: "t" });
    setTelemetryForTests(fake);
    expect(getTelemetry()).toBe(fake);
  });

  it("only reports an export as configured when an OTLP endpoint is set", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
    expect(otelExportConfigured()).toBe(false);
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otlp-gateway-prod-us-east-0.grafana.net/otlp");
    expect(otelExportConfigured()).toBe(true);
  });
});
