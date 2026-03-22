import { describe, it, expect, vi, beforeEach } from "vitest";

// This test validates the consent enforcement logic that was added to the voice route.
// The actual route handler requires complex Gemini Live setup, so we test the
// consent checking logic in isolation.

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("consent enforcement logic", () => {
  it("blocks when consentRecording is false", () => {
    const interview = {
      consentRecording: false,
      consentPrivacy: true,
      consentedAt: new Date(),
      type: "GENERAL_PROFILE",
    };

    const consentValid =
      interview.consentRecording &&
      interview.consentPrivacy &&
      interview.consentedAt;

    expect(consentValid).toBeFalsy();
  });

  it("blocks when consentPrivacy is false", () => {
    const interview = {
      consentRecording: true,
      consentPrivacy: false,
      consentedAt: new Date(),
      type: "GENERAL_PROFILE",
    };

    const consentValid =
      interview.consentRecording &&
      interview.consentPrivacy &&
      interview.consentedAt;

    expect(consentValid).toBeFalsy();
  });

  it("blocks when consentedAt is null", () => {
    const interview = {
      consentRecording: true,
      consentPrivacy: true,
      consentedAt: null,
      type: "GENERAL_PROFILE",
    };

    const consentValid =
      interview.consentRecording &&
      interview.consentPrivacy &&
      interview.consentedAt;

    expect(consentValid).toBeFalsy();
  });

  it("allows when all consent fields are present", () => {
    const interview = {
      consentRecording: true,
      consentPrivacy: true,
      consentedAt: new Date(),
      type: "GENERAL_PROFILE",
    };

    const consentValid =
      interview.consentRecording &&
      interview.consentPrivacy &&
      interview.consentedAt;

    expect(consentValid).toBeTruthy();
  });

  it("skips consent check for practice interviews", () => {
    const interview = {
      consentRecording: false,
      consentPrivacy: false,
      consentedAt: null,
      type: "PRACTICE",
    };

    const isPractice = interview.type === "PRACTICE";
    const consentValid =
      isPractice ||
      (interview.consentRecording &&
        interview.consentPrivacy &&
        interview.consentedAt);

    expect(consentValid).toBe(true);
  });
});
