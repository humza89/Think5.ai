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
  | "general";      // General purpose

/**
 * Get the configured provider for a given stage.
 * Falls back to the default provider if no stage-specific config exists.
 */
export function getProviderForStage(_stage: ProviderStage): string {
  // Currently single-provider (Gemini). Future: read from config/env.
  return process.env.AI_PROVIDER || "gemini";
}
