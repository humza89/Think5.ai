/**
 * Model Router — Routes AI requests to the appropriate provider with fallback.
 * Primary: Gemini. Fallback: Claude API (for scoring only).
 * Voice interviews fall back to text-SSE mode if Gemini Live is down.
 */

export type ModelProvider = "gemini" | "claude";
export type ModelTask = "scoring" | "interview_plan" | "voice_live" | "fact_extraction";

interface ModelHealth {
  provider: ModelProvider;
  healthy: boolean;
  lastChecked: number;
  consecutiveFailures: number;
}

const healthState = new Map<string, ModelHealth>();
const HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute
const MAX_CONSECUTIVE_FAILURES = 3;

export async function checkModelHealth(provider: ModelProvider): Promise<boolean> {
  const key = provider;
  const cached = healthState.get(key);

  if (cached && Date.now() - cached.lastChecked < HEALTH_CHECK_INTERVAL_MS) {
    return cached.healthy;
  }

  try {
    if (provider === "gemini") {
      // Light health check - just verify API key works
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return false;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const healthy = response.ok;
      healthState.set(key, { provider, healthy, lastChecked: Date.now(), consecutiveFailures: healthy ? 0 : (cached?.consecutiveFailures || 0) + 1 });
      return healthy;
    }

    if (provider === "claude") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      return !!apiKey;
    }

    return false;
  } catch {
    const failures = (cached?.consecutiveFailures || 0) + 1;
    healthState.set(key, { provider, healthy: false, lastChecked: Date.now(), consecutiveFailures: failures });
    return false;
  }
}

export async function selectProvider(task: ModelTask): Promise<ModelProvider> {
  // Voice live only works with Gemini
  if (task === "voice_live") return "gemini";

  const geminiHealthy = await checkModelHealth("gemini");
  if (geminiHealthy) return "gemini";

  // For scoring and planning, fall back to Claude
  if (task === "scoring" || task === "interview_plan") {
    const claudeHealthy = await checkModelHealth("claude");
    if (claudeHealthy) return "claude";
  }

  // Default to Gemini (let it fail with proper error)
  return "gemini";
}

export function recordModelFailure(provider: ModelProvider): void {
  const cached = healthState.get(provider);
  const failures = (cached?.consecutiveFailures || 0) + 1;
  healthState.set(provider, {
    provider,
    healthy: failures < MAX_CONSECUTIVE_FAILURES,
    lastChecked: Date.now(),
    consecutiveFailures: failures,
  });
}

export function recordModelSuccess(provider: ModelProvider): void {
  healthState.set(provider, {
    provider,
    healthy: true,
    lastChecked: Date.now(),
    consecutiveFailures: 0,
  });
}

export function getModelHealthStatus(): Record<string, ModelHealth> {
  const status: Record<string, ModelHealth> = {};
  for (const [key, value] of healthState) {
    status[key] = { ...value };
  }
  return status;
}
