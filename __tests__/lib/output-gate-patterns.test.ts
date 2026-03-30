import { describe, it, expect } from "vitest";
import { checkOutputGate } from "@/lib/output-gate";
import type { OutputGateInput } from "@/lib/output-gate";
import { hashQuestion } from "@/lib/interviewer-state";

const baseInput: OutputGateInput = {
  introDone: true,
  askedQuestionIds: [],
  verifiedFacts: [],
};

describe("Output Gate — All Intro Patterns", () => {
  const introPatterns: Array<{ name: string; text: string }> = [
    { name: "hi I'm Aria", text: "Hi, I'm Aria and I'll be your interviewer today." },
    { name: "welcome to", text: "Welcome to the technical interview. Let's get started." },
    { name: "thanks for joining", text: "Thanks for joining us today. I have some questions." },
    { name: "let me introduce", text: "Let me introduce myself before we begin." },
    { name: "I'll be conducting", text: "I'll be conducting your interview today. Ready?" },
    { name: "my name is", text: "My name is Aria and I'm here to interview you." },
    { name: "I'm your interviewer", text: "I'm your interviewer for this session. Shall we start?" },
    { name: "I am the interviewer", text: "I am the interviewer assigned to this session." },
    { name: "let me start by introducing", text: "Let me start by introducing myself and the format." },
    { name: "nice to meet you", text: "Nice to meet you! I'm excited about this interview." },
  ];

  for (const { name, text } of introPatterns) {
    it(`detects intro pattern: "${name}"`, () => {
      const result = checkOutputGate(text, baseInput);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === "reintroduction")).toBe(true);
    });
  }

  it("does not flag intro patterns when introDone is false", () => {
    for (const { text } of introPatterns) {
      const result = checkOutputGate(text, { ...baseInput, introDone: false });
      expect(result.violations.filter((v) => v.type === "reintroduction")).toHaveLength(0);
    }
  });

  it("does not flag non-intro text as reintroduction", () => {
    const clean = [
      "That's a great point about distributed systems. Can you elaborate?",
      "Tell me more about how you handled the scaling challenge.",
      "Interesting. What was the outcome of that project?",
    ];
    for (const text of clean) {
      const result = checkOutputGate(text, baseInput);
      expect(result.violations.filter((v) => v.type === "reintroduction")).toHaveLength(0);
    }
  });
});

describe("Output Gate — Semantic Dedup", () => {
  it("detects semantically similar questions (Jaccard >= 0.6)", () => {
    const result = checkOutputGate(
      "Could you describe your experience leading engineering teams at large companies?",
      {
        ...baseInput,
        askedQuestionTexts: [
          "Can you describe your experience leading engineering teams at large organizations?",
        ],
      }
    );
    expect(result.violations.some((v) => v.type === "duplicate_question")).toBe(true);
  });

  it("does not flag dissimilar questions", () => {
    const result = checkOutputGate(
      "What programming languages are you most comfortable with?",
      {
        ...baseInput,
        askedQuestionTexts: [
          "Can you describe your experience leading engineering teams?",
        ],
      }
    );
    expect(result.violations.filter((v) => v.type === "duplicate_question")).toHaveLength(0);
  });

  it("skips dedup for questions on revisit allow list", () => {
    const question = "What was the biggest challenge you faced?";
    const qHash = hashQuestion(question);
    const result = checkOutputGate(
      `That's interesting. ${question}`,
      {
        ...baseInput,
        askedQuestionIds: [qHash],
        revisitAllowList: [qHash],
      }
    );
    expect(result.violations.filter((v) => v.type === "duplicate_question")).toHaveLength(0);
  });
});
