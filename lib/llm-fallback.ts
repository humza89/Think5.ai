/**
 * LLM Fallback — tries Gemini first, falls back to OpenAI if Gemini fails.
 * Ensures interviews can continue during partial provider outages.
 */

import { logger } from "@/lib/logger";

interface LLMGenerateOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

interface LLMResponse {
  text: string;
  provider: "gemini" | "openai";
  model: string;
}

export async function generateWithFallback(options: LLMGenerateOptions): Promise<LLMResponse> {
  // Try Gemini first
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: options.model || "gemini-1.5-pro",
        generationConfig: {
          temperature: options.temperature ?? 0.15,
          maxOutputTokens: options.maxTokens ?? 8192,
        },
      });
      const result = await model.generateContent(options.prompt);
      const text = result.response.text();
      return { text, provider: "gemini", model: options.model || "gemini-1.5-pro" };
    } catch (err) {
      logger.warn("[llm-fallback] Gemini failed, attempting OpenAI fallback", err as Record<string, unknown>);
    }
  }

  // Fallback to OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("Both Gemini and OpenAI unavailable — no LLM provider configured");
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: openaiKey });
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || "gpt-4o";
    const completion = await client.chat.completions.create({
      model: fallbackModel,
      messages: [{ role: "user", content: options.prompt }],
      temperature: options.temperature ?? 0.15,
      max_tokens: options.maxTokens ?? 8192,
    });
    const text = completion.choices[0]?.message?.content || "";
    return { text, provider: "openai", model: fallbackModel };
  } catch (err) {
    logger.error("[llm-fallback] OpenAI fallback also failed", err);
    throw new Error("All LLM providers failed");
  }
}

export async function generateTextWithFallback(prompt: string, temperature = 0.3): Promise<string> {
  const response = await generateWithFallback({ prompt, temperature });
  return response.text;
}
