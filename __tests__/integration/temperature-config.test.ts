import { describe, it, expect, beforeEach, afterAll } from "vitest";

/**
 * Tests for enterprise-safe generation temperature defaults — validates WS5.
 *
 * Verifies that the default temperature for voice interviews is 0.3 (conservative),
 * and that environment variable overrides work correctly.
 *
 * Reference: lib/gemini-live.ts line 220
 */

describe("gemini-live temperature configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_LIVE_TEMPERATURE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults to 0.3 when no env override is set", async () => {
    delete process.env.GEMINI_LIVE_TEMPERATURE;

    // Dynamic import to pick up fresh env state
    const { buildSetupMessage } = await import("@/lib/gemini-live");

    const msg = buildSetupMessage({
      systemInstruction: "Test prompt",
    } as Parameters<typeof buildSetupMessage>[0]);

    const genConfig = (msg.setup as Record<string, unknown>).generationConfig as Record<string, unknown>;
    expect(genConfig.temperature).toBe(0.3);
  });

  it("respects GEMINI_LIVE_TEMPERATURE env var override", async () => {
    process.env.GEMINI_LIVE_TEMPERATURE = "0.5";

    // Re-import to pick up new env value (parseFloat happens at call time, not module load time)
    const { buildSetupMessage } = await import("@/lib/gemini-live");

    const msg = buildSetupMessage({
      systemInstruction: "Test prompt",
    } as Parameters<typeof buildSetupMessage>[0]);

    const genConfig = (msg.setup as Record<string, unknown>).generationConfig as Record<string, unknown>;
    expect(genConfig.temperature).toBe(0.5);
  });

  it("config.generationConfig.temperature takes precedence over env var", async () => {
    process.env.GEMINI_LIVE_TEMPERATURE = "0.9";

    const { buildSetupMessage } = await import("@/lib/gemini-live");

    const msg = buildSetupMessage({
      systemInstruction: "Test prompt",
      generationConfig: { temperature: 0.15 },
    } as Parameters<typeof buildSetupMessage>[0]);

    const genConfig = (msg.setup as Record<string, unknown>).generationConfig as Record<string, unknown>;
    expect(genConfig.temperature).toBe(0.15);
  });

  it("response modalities are AUDIO only", async () => {
    const { buildSetupMessage } = await import("@/lib/gemini-live");

    const msg = buildSetupMessage({
      systemInstruction: "Test prompt",
    } as Parameters<typeof buildSetupMessage>[0]);

    const genConfig = (msg.setup as Record<string, unknown>).generationConfig as Record<string, unknown>;
    expect(genConfig.responseModalities).toEqual(["AUDIO"]);
  });
});
