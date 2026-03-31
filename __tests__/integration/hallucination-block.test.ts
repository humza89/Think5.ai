/**
 * REM-7: Semantic Contradiction Detector — 20-case hallucination block rate
 *
 * Validates that the commitTurn pipeline (output gate + grounding gate +
 * contradiction detector) blocks AI turns that hallucinate facts the
 * candidate never stated.
 *
 * Target: 100% block rate on 20 crafted hallucination cases.
 * Distribution: 7 numeric, 7 entity, 6 temporal.
 * Zero false positives on 10 courtesy phrases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitTurn } from "@/lib/session-brain";
import type { TurnCommitRequest } from "@/lib/session-brain";
import { verifyGrounding, extractAssertions } from "@/lib/grounding-gate";
import { createInitialState, serializeState, transitionState } from "@/lib/interviewer-state";

// ── Mocks ────────────────────────────────────────────────────────────

let mockVersion = 0;
vi.mock("@/lib/conversation-ledger", () => ({
  commitSingleTurn: vi.fn().mockImplementation(() => {
    mockVersion++;
    return Promise.resolve({ committed: true, currentVersion: mockVersion, turn: { turnIndex: mockVersion } });
  }),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockReturnValue(true), // All gates enabled
  FeatureFlags: { OUTPUT_GATE_BLOCKING: true, GROUNDING_GATE_ENABLED: true, TURN_COMMIT_PROTOCOL: true, SEMANTIC_CONTRADICTION_DETECTOR: true },
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function buildLockedState(): string {
  let state = createInitialState();
  state = transitionState(state, { type: "PERSONA_LOCKED" });
  state = transitionState(state, { type: "INTRO_COMPLETED" });
  state = transitionState(state, { type: "MOVE_TO_STEP", step: "resume_deep_dive" });
  return serializeState(state);
}

function makeTurnRequest(content: string): TurnCommitRequest {
  return {
    turnId: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "interviewer",
    content,
    clientTimestamp: new Date().toISOString(),
  };
}

function makeSessionState(
  verifiedFacts: Array<{ factType: string; content: string; confidence: number }>,
  aiContent: string,
  interviewerStateJson: string,
) {
  return {
    interviewerState: interviewerStateJson,
    lastTurnIndex: mockVersion,
    verifiedFacts,
    recentTurns: [{ turnId: "candidate-turn-1", content: aiContent }],
    factCount: verifiedFacts.length,
  };
}

// ── Test Data ────────────────────────────────────────────────────────

interface HallucinationCase {
  facts: string[];
  aiClaim: string;
  label: string;
  type: "numeric" | "entity" | "temporal";
}

const HALLUCINATION_CASES: HallucinationCase[] = [
  // ── Numeric (7): wrong numbers, shared entity ──────────────────────
  {
    facts: ["5 years at Google on search"],
    aiClaim: "You mentioned your 10 years at Google working on advertising",
    label: "inflated tenure + wrong team",
    type: "numeric",
  },
  {
    facts: ["led team of 8 engineers at Meta"],
    aiClaim: "You said you managed a team of 50 engineers at Meta",
    label: "inflated team size",
    type: "numeric",
  },
  {
    facts: ["improved latency by 40% at Amazon"],
    aiClaim: "You mentioned reducing latency by 90% at Amazon",
    label: "inflated metric",
    type: "numeric",
  },
  {
    facts: ["increased revenue by 15% at Stripe"],
    aiClaim: "You mentioned that you grew revenue by 80% at Stripe",
    label: "inflated revenue",
    type: "numeric",
  },
  {
    facts: ["managed a budget of $500K at Netflix"],
    aiClaim: "You said you oversaw a $10 million budget at Netflix",
    label: "inflated budget by 20x",
    type: "numeric",
  },
  {
    facts: ["reduced error rate from 5% to 1% at Google"],
    aiClaim: "You mentioned achieving 0.001% error rate at Google",
    label: "fabricated SLA claim",
    type: "numeric",
  },
  {
    facts: ["mentored 2 junior developers at Uber"],
    aiClaim: "You said you built a mentorship program for 30 people at Uber",
    label: "inflated mentorship scope",
    type: "numeric",
  },

  // ── Entity (7): wrong companies, technologies, domains ─────────────
  {
    facts: ["bachelor's from MIT"],
    aiClaim: "You said you got your PhD from Stanford",
    label: "wrong degree + wrong school",
    type: "entity",
  },
  {
    facts: ["experience with Kubernetes"],
    aiClaim: "You mentioned your extensive experience with Terraform and CloudFormation",
    label: "wrong technologies",
    type: "entity",
  },
  {
    facts: ["worked on backend microservices in Python"],
    aiClaim: "You mentioned your frontend React work building dashboards",
    label: "wrong stack + wrong domain",
    type: "entity",
  },
  {
    facts: ["3 years at Meta on Instagram"],
    aiClaim: "You said you spent 7 years at Amazon working on AWS Lambda",
    label: "wrong company + wrong product + wrong tenure",
    type: "entity",
  },
  {
    facts: ["used PostgreSQL and Redis for caching"],
    aiClaim: "You noted your deep experience with MongoDB and Cassandra for distributed databases",
    label: "wrong database technologies",
    type: "entity",
  },
  {
    facts: ["AWS Solutions Architect certification"],
    aiClaim: "You said you have Google Cloud Professional Data Engineer and Machine Learning certifications",
    label: "wrong cloud provider + wrong certifications",
    type: "entity",
  },
  {
    facts: ["implemented CI/CD pipeline with GitHub Actions"],
    aiClaim: "You mentioned building a custom deployment platform using Jenkins and Ansible",
    label: "wrong CI/CD tools",
    type: "entity",
  },

  // ── Temporal (6): wrong dates, durations, impossible timelines ─────
  {
    facts: ["left Google in 2020"],
    aiClaim: "You mentioned being promoted at Google in 2022",
    label: "activity after departure",
    type: "temporal",
  },
  {
    facts: ["worked at Meta from 2019 to 2020"],
    aiClaim: "You said you spent 5 years at Meta on their infrastructure team",
    label: "duration mismatch: 1y claimed as 5y",
    type: "temporal",
  },
  {
    facts: ["graduated in 2019 from UC Berkeley"],
    aiClaim: "You mentioned graduating in 2012 from Carnegie Mellon",
    label: "wrong graduation year + wrong university",
    type: "temporal",
  },
  {
    facts: ["left Netflix in 2019"],
    aiClaim: "You mentioned managing a project at Netflix in 2022",
    label: "activity after departure from Netflix",
    type: "temporal",
  },
  {
    facts: ["1 year at Stripe from 2022 to 2023"],
    aiClaim: "You said you spent 4 years at Stripe leading their payments team",
    label: "duration mismatch: 1y claimed as 4y",
    type: "temporal",
  },
  {
    facts: ["started at Amazon in 2021"],
    aiClaim: "You said you led a team at Amazon from 2015 to 2018",
    label: "predates actual employment",
    type: "temporal",
  },
];

const COURTESY_PHRASES = [
  "That's great, thank you for sharing that. Do you have any questions for me?",
  "You're doing great. Take your time.",
  "Thank you for explaining that.",
  "That's a wonderful point.",
  "I appreciate you sharing that experience.",
  "Understood, thanks for the additional context.",
  "That makes a lot of sense. Let's continue.",
  "Absolutely, I can see how that would be valuable.",
  "That's helpful background. Shall we move on?",
  "Thank you, I appreciate your thoroughness.",
];

// ── Valid block reasons ──────────────────────────────────────────────

const VALID_BLOCK_REASONS = [
  "GROUNDING_GATE_BLOCKED",
  "SEMANTIC_CONTRADICTION_DETECTED",
  "OUTPUT_GATE_BLOCKED",
];

// ── Tests ────────────────────────────────────────────────────────────

describe("REM-7: Semantic Contradiction Detector — Hallucination Block Rate", () => {
  beforeEach(() => {
    mockVersion = 0;
    vi.clearAllMocks();
  });

  describe("Type distribution verification", () => {
    it("has exactly 7 numeric, 7 entity, 6 temporal cases", () => {
      const numeric = HALLUCINATION_CASES.filter((c) => c.type === "numeric");
      const entity = HALLUCINATION_CASES.filter((c) => c.type === "entity");
      const temporal = HALLUCINATION_CASES.filter((c) => c.type === "temporal");

      expect(numeric).toHaveLength(7);
      expect(entity).toHaveLength(7);
      expect(temporal).toHaveLength(6);
      expect(HALLUCINATION_CASES).toHaveLength(20);
    });
  });

  describe("20-case hallucination block rate (=== 100%)", () => {
    it("blocks all 20 hallucinated AI turns", async () => {
      const stateJson = buildLockedState();
      let blockedCount = 0;
      const results: Array<{ label: string; type: string; blocked: boolean; reason?: string }> = [];

      for (const testCase of HALLUCINATION_CASES) {
        const verifiedFacts = testCase.facts.map((f) => ({
          factType: "CLAIM",
          content: f,
          confidence: 0.9,
        }));

        const request = makeTurnRequest(testCase.aiClaim);
        const session = makeSessionState(verifiedFacts, testCase.aiClaim, stateJson);

        const result = await commitTurn("interview-hallucination-test", request, session);

        const blocked = !result.committed;
        if (blocked) blockedCount++;

        results.push({
          label: testCase.label,
          type: testCase.type,
          blocked,
          reason: result.reason,
        });
      }

      // Log individual results for debugging
      for (const r of results) {
        if (!r.blocked) {
          console.warn(`[MISSED] [${r.type}] "${r.label}" was NOT blocked (reason: ${r.reason ?? "committed"})`);
        }
      }

      console.log(`Hallucination block rate: ${blockedCount}/${HALLUCINATION_CASES.length} (${((blockedCount / HALLUCINATION_CASES.length) * 100).toFixed(1)}%)`);
      expect(blockedCount).toBe(20);
    });

    // Individual case tests with HARD assertions
    it.each(HALLUCINATION_CASES.map((c, i) => [i + 1, c.type, c.label, c] as const))(
      "case %d [%s]: blocks hallucination — %s",
      async (_index, _type, _label, testCase) => {
        const stateJson = buildLockedState();
        const verifiedFacts = testCase.facts.map((f) => ({
          factType: "CLAIM",
          content: f,
          confidence: 0.9,
        }));

        const request = makeTurnRequest(testCase.aiClaim);
        const session = makeSessionState(verifiedFacts, testCase.aiClaim, stateJson);

        const result = await commitTurn("interview-hallucination-test", request, session);

        // HARD assertions — every case must be blocked
        expect(result.committed).toBe(false);
        expect(VALID_BLOCK_REASONS).toContain(result.reason);
        expect(result.violations.length).toBeGreaterThan(0);

        // When blocked by contradiction detector, regenerationPrompt must be present
        if (result.reason === "SEMANTIC_CONTRADICTION_DETECTED") {
          expect(result.regenerationPrompt).toBeDefined();
          expect(result.regenerationPrompt).toContain("verified facts");
        }
      },
    );
  });

  describe("Case 21: mixed courtesy + hallucination", () => {
    it("blocks a turn containing both courtesy phrase and hallucinated claim", async () => {
      const stateJson = buildLockedState();
      const verifiedFacts = [
        { factType: "COMPANY", content: "3 years at Google on search", confidence: 0.9 },
      ];

      const mixedContent =
        "That's really helpful, thank you for sharing. You mentioned your 15 years at Google leading their entire cloud division.";

      const request = makeTurnRequest(mixedContent);
      const session = makeSessionState(verifiedFacts, mixedContent, stateJson);

      const result = await commitTurn("interview-mixed-test", request, session);

      // Hallucination must be caught despite courtesy wrapper
      expect(result.committed).toBe(false);
      expect(VALID_BLOCK_REASONS).toContain(result.reason);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("the courtesy portion alone produces no false positive", () => {
      const courtesyOnly = "That's really helpful, thank you for sharing.";
      const facts = [
        { factType: "COMPANY" as const, content: "3 years at Google on search", confidence: 0.9, turnId: "t1", extractedBy: "regex" },
      ];

      const result = verifyGrounding(courtesyOnly, facts);
      expect(result.grounded).toBe(true);
      expect(result.totalClaims).toBe(0);
    });
  });

  describe("10 courtesy phrases — zero false positives", () => {
    const courtesyFacts: Array<{ factType: "CLAIM" | "METRIC" | "DATE" | "COMPANY" | "RESPONSIBILITY"; content: string; confidence: number; turnId: string; extractedBy: string }> = [
      { factType: "COMPANY", content: "5 years at Google on search", confidence: 0.9, turnId: "t1", extractedBy: "regex" },
      { factType: "METRIC", content: "led a team of 8 engineers", confidence: 0.85, turnId: "t2", extractedBy: "regex" },
    ];

    it.each(COURTESY_PHRASES.map((phrase, i) => [i + 1, phrase] as const))(
      "courtesy phrase %d is grounded (no false positive): %s",
      (_index, courtesyText) => {
        const result = verifyGrounding(courtesyText, courtesyFacts);

        // Courtesy phrases contain no factual assertions, so grounding is trivially true
        expect(result.grounded).toBe(true);
        expect(result.totalClaims).toBe(0);
      },
    );

    it("all 10 courtesy phrases produce zero false positives", () => {
      let falsePositives = 0;

      for (const phrase of COURTESY_PHRASES) {
        const result = verifyGrounding(phrase, courtesyFacts);
        if (!result.grounded) falsePositives++;
      }

      expect(falsePositives).toBe(0);
    });
  });

  describe("extractAssertions — factual claim extraction", () => {
    it("extracts factual claims from AI response referencing candidate statements", () => {
      const aiResponse =
        "You mentioned your 5 years at Google working on search infrastructure, and you noted that you led a team of 8 engineers.";

      const assertions = extractAssertions(aiResponse);

      expect(assertions.length).toBeGreaterThanOrEqual(2);
      // Should capture the Google reference and the team size reference
      const joined = assertions.join(" ").toLowerCase();
      expect(joined).toMatch(/google/);
      expect(joined).toMatch(/8|engineer/);
    });

    it("extracts number-based claims", () => {
      const aiResponse = "Your 10 years at Amazon sounds impressive. The 40% improvement in throughput is notable.";

      const assertions = extractAssertions(aiResponse);
      expect(assertions.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts entity/role references", () => {
      const aiResponse = "Your role as a senior architect at Netflix must have been challenging.";

      const assertions = extractAssertions(aiResponse);
      expect(assertions.length).toBeGreaterThanOrEqual(1);
      const joined = assertions.join(" ").toLowerCase();
      expect(joined).toMatch(/netflix|senior|architect/);
    });

    it("does not extract from pure questions without assertions", () => {
      const aiResponse = "What technologies have you used in your previous roles?";

      const assertions = extractAssertions(aiResponse);
      expect(assertions.length).toBe(0);
    });
  });

  describe("Regeneration guidance on block", () => {
    it("returns unsupported_claim violations when commitTurn blocks a hallucinated turn", async () => {
      const stateJson = buildLockedState();
      const verifiedFacts = [
        { factType: "COMPANY", content: "3 years at a small startup", confidence: 0.9 },
      ];

      const request = makeTurnRequest(
        "You mentioned your 15 years at Google leading their entire cloud division."
      );
      const session = makeSessionState(verifiedFacts, request.content, stateJson);

      const result = await commitTurn("interview-regen-test", request, session);

      expect(result.committed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.type === "unsupported_claim")).toBe(true);
    });

    it("includes descriptive detail in unsupported_claim violations", async () => {
      const stateJson = buildLockedState();
      const verifiedFacts = [
        { factType: "METRIC", content: "reduced page load time by 20%", confidence: 0.9 },
      ];

      const request = makeTurnRequest(
        "You mentioned reducing page load time by 95% which is extraordinary."
      );
      const session = makeSessionState(verifiedFacts, request.content, stateJson);

      const result = await commitTurn("interview-regen-detail-test", request, session);

      expect(result.committed).toBe(false);
      const unsupportedViolations = result.violations.filter((v) => v.type === "unsupported_claim");
      expect(unsupportedViolations.length).toBeGreaterThan(0);
      for (const v of unsupportedViolations) {
        expect(v.detail).toBeTruthy();
        expect(v.detail.length).toBeGreaterThan(0);
      }
    });
  });

  describe("CERTIFICATION: hallucination block & false positive rates", () => {
    it("CERTIFICATION: block rate === 100%, false positive rate === 0%", async () => {
      const stateJson = buildLockedState();

      // Phase 1: Run all 20 hallucination cases
      let blockedCount = 0;
      for (const testCase of HALLUCINATION_CASES) {
        const verifiedFacts = testCase.facts.map((f) => ({
          factType: "CLAIM",
          content: f,
          confidence: 0.9,
        }));

        const request = makeTurnRequest(testCase.aiClaim);
        const session = makeSessionState(verifiedFacts, testCase.aiClaim, stateJson);
        const result = await commitTurn("cert-hallucination", request, session);

        if (!result.committed) blockedCount++;
      }

      // Phase 2: Run all 10 courtesy phrases through commitTurn
      let falsePositives = 0;
      const courtesyVerifiedFacts = [
        { factType: "COMPANY", content: "5 years at Google on search", confidence: 0.9 },
        { factType: "METRIC", content: "led a team of 8 engineers", confidence: 0.85 },
      ];

      for (const phrase of COURTESY_PHRASES) {
        const request = makeTurnRequest(phrase);
        const session = makeSessionState(courtesyVerifiedFacts, phrase, stateJson);
        const result = await commitTurn("cert-courtesy", request, session);

        if (!result.committed) falsePositives++;
      }

      // Certification assertions
      const certifiedBlockRate = blockedCount / HALLUCINATION_CASES.length;
      const certifiedFalsePositiveRate = falsePositives / COURTESY_PHRASES.length;

      console.log(`CERTIFICATION — Block rate: ${(certifiedBlockRate * 100).toFixed(1)}%, False positive rate: ${(certifiedFalsePositiveRate * 100).toFixed(1)}%`);

      expect(certifiedBlockRate).toBe(1.0);
      expect(certifiedFalsePositiveRate).toBe(0.0);
    });
  });
});
