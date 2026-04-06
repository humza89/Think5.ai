/**
 * Token counting via Gemini's countTokens API.
 * Replaces manual estimation with accurate model-specific counts.
 * Includes in-memory caching for repeated content.
 */

const tokenCache = new Map<string, { count: number; expiresAt: number }>();
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Count tokens for a text string using the Gemini countTokens API.
 * Falls back to character-based estimation if the API is unavailable.
 */
export async function countTokens(
  text: string,
  model = "gemini-1.5-pro"
): Promise<number> {
  // Check cache first (same text always has same token count)
  const cacheKey = `${model}:${text.length}:${text.slice(0, 100)}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return estimateTokens(text);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return estimateTokens(text);
    }

    const data = await response.json();
    const count = data.totalTokens as number;

    // Cache the result
    tokenCache.set(cacheKey, { count, expiresAt: Date.now() + CACHE_TTL_MS });

    // Evict old cache entries periodically
    if (tokenCache.size > 1000) {
      const now = Date.now();
      for (const [key, entry] of tokenCache) {
        if (entry.expiresAt < now) tokenCache.delete(key);
      }
    }

    return count;
  } catch {
    return estimateTokens(text);
  }
}

/**
 * Fallback: estimate tokens from character count.
 * Average English text is ~4 characters per token for most LLMs.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content fits within a token budget.
 */
export async function fitsTokenBudget(
  text: string,
  budget: number,
  model?: string
): Promise<boolean> {
  const count = await countTokens(text, model);
  return count <= budget;
}
