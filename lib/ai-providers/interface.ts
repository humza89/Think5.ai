/**
 * AI Provider Interface
 *
 * Abstraction layer for AI model providers. Enables provider switching,
 * fallback chains, and stage-specific model routing.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface ChatResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * Abstract AI provider interface.
 * Implementations: GeminiProvider, (future) OpenAIProvider, ClaudeProvider
 */
export interface AIProvider {
  /** Provider name for logging and audit trail */
  readonly name: string;

  /** Model identifier used for this provider */
  readonly model: string;

  /** Generate a complete chat response */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Generate a streaming chat response */
  streamChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk>;

  /** Check if the provider is available/configured */
  isAvailable(): boolean;
}

/**
 * Provider stage — different AI tasks may use different providers/models.
 */
export type ProviderStage =
  | "planning"      // Interview plan generation
  | "interviewing"  // Live interview (text)
  | "voice"         // Live interview (voice)
  | "scoring"       // Post-interview scoring/report
  | "evidence"      // Evidence bundle compilation
  | "general";      // General purpose

/**
 * Stage-specific environment variable mapping.
 * Each stage can be configured independently via env vars.
 */
const STAGE_ENV_MAP: Record<ProviderStage, string> = {
  planning: "AI_PROVIDER_PLANNING",
  interviewing: "AI_PROVIDER_INTERVIEWING",
  voice: "AI_PROVIDER_VOICE",
  scoring: "AI_PROVIDER_SCORING",
  evidence: "AI_PROVIDER_EVIDENCE",
  general: "AI_PROVIDER",
};

/**
 * Get the configured provider name for a given stage.
 * Falls back to AI_PROVIDER, then to "gemini".
 */
export function getProviderForStage(stage: ProviderStage): string {
  return (
    process.env[STAGE_ENV_MAP[stage]] ||
    process.env.AI_PROVIDER ||
    "gemini"
  );
}

/**
 * Instantiate an AIProvider for a given stage.
 * Uses stage-specific env vars for provider selection.
 */
export async function createProviderForStage(stage: ProviderStage): Promise<AIProvider> {
  const providerName = getProviderForStage(stage);

  switch (providerName) {
    case "claude": {
      const { ClaudeProvider } = await import("./claude");
      // Use different models per stage
      const modelMap: Partial<Record<ProviderStage, string>> = {
        scoring: "claude-sonnet-4-20250514",
        planning: "claude-sonnet-4-20250514",
        evidence: "claude-haiku-4-5-20251001",
      };
      return new ClaudeProvider(modelMap[stage]);
    }
    case "gemini":
    default: {
      const { GeminiProvider } = await import("./gemini");
      return new GeminiProvider();
    }
  }
}
