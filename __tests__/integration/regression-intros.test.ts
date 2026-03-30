import { describe, it, expect } from "vitest";
import {
  checkOutputGate,
  checkOutputGateWithAction,
} from "@/lib/output-gate";
import type { OutputGateInput } from "@/lib/output-gate";
import { createInitialState, transitionState } from "@/lib/interviewer-state";

describe("Regression: Repeated Intro Prevention", () => {
  const makeIntroDoneInput = (): OutputGateInput => ({
    introDone: true,
    askedQuestionIds: [],
    verifiedFacts: [],
  });

  const INTRO_PATTERNS = [
    "Hi, I'm Aria! How are you doing today?",
    "Welcome to the interview. Let me explain how this works.",
    "Thanks for joining us today. I'm excited to learn about you.",
    "Let me introduce myself — I'm Aria, your interviewer.",
    "I'll be conducting your interview today.",
    "My name is Aria, and I'm here to interview you.",
    "I'm your interviewer for today's session.",
    "I am the interviewer for this role.",
    "Let me start by introducing myself.",
    "Nice to meet you! I'm looking forward to our conversation.",
  ];

  it("blocks ALL known intro patterns when introDone=true (blocking mode)", () => {
    const input = makeIntroDoneInput();

    for (const pattern of INTRO_PATTERNS) {
      const combined = `${pattern} Tell me about your experience with distributed systems.`;
      const result = checkOutputGateWithAction(combined, input, true);

      expect(
        result.violations.some((v) => v.type === "reintroduction"),
        `Expected reintroduction violation for: "${pattern.slice(0, 50)}..."`
      ).toBe(true);
    }
  });

  it("does NOT block intro on first interaction (introDone=false)", () => {
    const input: OutputGateInput = {
      introDone: false,
      askedQuestionIds: [],
      verifiedFacts: [],
    };

    const result = checkOutputGate(
      "Hi, I'm Aria! Welcome to the interview. Can you tell me about yourself?",
      input
    );
    expect(result.passed).toBe(true);
  });

  it("sanitized response preserves the substantive question content", () => {
    const input = makeIntroDoneInput();
    const original =
      "Hi, I'm Aria. Welcome to the interview. Can you walk me through your experience with distributed systems and how you handled scaling challenges?";

    const result = checkOutputGateWithAction(original, input, true);

    expect(result.sanitizedResponse).toBeDefined();
    expect(result.sanitizedResponse!).toContain("distributed systems");
    expect(result.sanitizedResponse!).toContain("scaling challenges");
  });

  it("introDone flag transitions correctly via InterviewerState", () => {
    let state = createInitialState();
    expect(state.introDone).toBe(false);

    state = transitionState(state, { type: "INTRO_COMPLETED" });
    expect(state.introDone).toBe(true);

    // After intro complete, gate should catch reintroductions
    const result = checkOutputGate("Hi, I'm Aria. Let me ask you about your background.", {
      introDone: state.introDone,
      askedQuestionIds: state.askedQuestionIds,
      verifiedFacts: [],
    });
    expect(result.violations.some((v) => v.type === "reintroduction")).toBe(true);
  });

  it("blocks re-intro even when mixed with valid follow-up content", () => {
    const input = makeIntroDoneInput();
    const mixed =
      "Thanks for joining us today. Based on your earlier mention of microservices, can you elaborate on the architectural decisions you made?";

    const result = checkOutputGateWithAction(mixed, input, true);
    expect(result.violations.some((v) => v.type === "reintroduction")).toBe(true);
    // Sanitized should preserve the substantive question
    if (result.sanitizedResponse) {
      expect(result.sanitizedResponse).toContain("microservices");
    }
  });
});
