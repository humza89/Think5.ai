/**
 * Gemini AI Provider
 *
 * Wraps Google's Generative AI SDK for use through the provider interface.
 */

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from "./interface";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;
  private apiKey: string;

  constructor(model?: string) {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.model = model || "gemini-1.5-pro";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.model });

    // Extract system prompt and conversation history
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      history: chatMessages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(systemMessage && {
        systemInstruction: { role: "system", parts: [{ text: systemMessage.content }] },
      }),
      generationConfig: {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
        ...(options?.responseFormat === "json" && { responseMimeType: "application/json" }),
      },
    });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessage(lastMessage?.content || "");
    const response = result.response;

    return {
      content: response.text(),
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount || 0,
            outputTokens: response.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
      model: this.model,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.model });

    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const chat = model.startChat({
      history: chatMessages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(systemMessage && {
        systemInstruction: { role: "system", parts: [{ text: systemMessage.content }] },
      }),
      generationConfig: {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens && { maxOutputTokens: options.maxTokens }),
      },
    });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage?.content || "");

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { content: text, done: false };
      }
    }
    yield { content: "", done: true };
  }
}
