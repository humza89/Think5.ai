export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // T11 Step 3: report Redis configuration at boot; never crash on it.
    const { reportRedisConfiguration } = await import("./lib/redis-degradation");
    reportRedisConfiguration();
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}
