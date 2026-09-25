/**
 * Next.js instrumentation hook (Phase 0 T12).
 *
 * Registers the OpenTelemetry SDK through @vercel/otel, exporting traces and
 * metrics over OTLP to the configured backend (Grafana Cloud):
 *   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. https://otlp-gateway-<region>.grafana.net/otlp
 *   OTEL_EXPORTER_OTLP_HEADERS    e.g. Authorization=Basic <base64 instance:token>
 * Without an endpoint the SDK is not registered and lib/otel.ts falls back to
 * the no-op API, so local, CI and preview builds stay quiet. Sentry remains
 * error capture only and is linked to traces by trace_id.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // T11 Step 3: report Redis configuration at boot; never crash on it.
    const { reportRedisConfiguration } = await import("./lib/redis-degradation");
    reportRedisConfiguration();
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
      const { registerOTel } = await import("@vercel/otel");
      registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME || "think5-web" });
    }
    await import("./sentry.server.config");
  }
}
