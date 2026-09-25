/**
 * Relay OpenTelemetry (Phase 0 T12/T13).
 *
 * Registers the Node SDK with OTLP/HTTP exporters only when
 * OTEL_EXPORTER_OTLP_ENDPOINT (or _TRACES_ENDPOINT) is set — the same
 * contract as the web tier's instrumentation.ts. Without it every instrument
 * below is a no-op from @opentelemetry/api, so local runs stay quiet.
 *
 * Metric names match docs/ops/grafana/relay.json. Counters are exported with
 * their `_total` suffix as-is; `relay_active_connections` is an up/down counter.
 * The relay stays on the media plane: no Prisma, no tenant data in attributes.
 */
import { metrics } from "@opentelemetry/api";

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "think5-relay";
const meter = metrics.getMeter(SERVICE_NAME);

export const relayMetrics = {
  activeConnections: meter.createUpDownCounter("relay_active_connections", { description: "Open client WebSocket sessions" }),
  connectionsTotal: meter.createCounter("relay_connections_total", { description: "Client sessions accepted" }),
  geminiReconnectsTotal: meter.createCounter("relay_gemini_reconnects_total", { description: "Upstream reconnect attempts" }),
  geminiReconnectFailuresTotal: meter.createCounter("relay_gemini_reconnect_failures_total", { description: "Upstream reconnects exhausted" }),
  bufferOverflowsTotal: meter.createCounter("relay_buffer_overflows_total", { description: "Client frames dropped while upstream was down" }),
  messagesTotal: meter.createCounter("relay_messages_total", { description: "Frames relayed in either direction" }),
  bytesTotal: meter.createCounter("relay_bytes_total", { description: "Bytes relayed in either direction", unit: "By" }),
  drainStartedTotal: meter.createCounter("relay_drain_started_total", { description: "SIGTERM drains started" }),
  drainForceTerminatedTotal: meter.createCounter("relay_drain_force_terminated_total", { description: "Sessions cut at drain timeout" }),
  geminiConnectTimeoutsTotal: meter.createCounter("relay_gemini_connect_timeouts_total", { description: "Upstream sockets that never opened" }),
  geminiSetupTimeoutsTotal: meter.createCounter("relay_gemini_setup_timeouts_total", { description: "Upstream setup responses that never arrived" }),
};

export function otelExportConfigured(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
}

let started = false;

/** Start the SDK when an OTLP endpoint is configured. Returns whether export is on. */
export async function startRelayTelemetry(region: string): Promise<boolean> {
  if (started) return true;
  if (!otelExportConfigured()) return false;
  const [{ NodeSDK }, { OTLPTraceExporter }, { OTLPMetricExporter }, { PeriodicExportingMetricReader }, { resourceFromAttributes }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/resources"),
  ]);
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": SERVICE_NAME,
      "service.version": process.env.SENTRY_RELEASE || "relay@unknown",
      "deployment.environment": process.env.OTEL_DEPLOYMENT_ENVIRONMENT || process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      "fly.region": region,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 30_000 }),
  });
  sdk.start();
  started = true;
  const shutdown = () => { sdk.shutdown().catch(() => {}); };
  process.once("beforeExit", shutdown);
  return true;
}
