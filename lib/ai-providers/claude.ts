/**
 * Claude AI Provider
 *
 * Wraps Anthropic's Claude API for use through the provider interface.
 * Recommended for: interview planning, scoring/report generation, evidence compilation.
 */

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from "./interface";

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  readonly model: string;
  private apiKey: string;

  constructor(model?: string) {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    this.model = model || "claude-sonnet-4-20250514";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    // Extract system prompt
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(systemMessage && { system: systemMessage.content }),
      messages: chatMessages,
    });

    const textContent = response.content.find((c) => c.type === "text");

    return {
      content: textContent?.text || "",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: this.model,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(systemMessage && { system: systemMessage.content }),
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { content: event.delta.text, done: false };
      }
    }
    yield { content: "", done: true };
  }
}
