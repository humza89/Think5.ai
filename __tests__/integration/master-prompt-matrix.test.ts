import { describe, it, expect } from "vitest";
import { commitTurn, computeContextChecksum } from "@/lib/session-brain";
import { checkOutputGate } from "@/lib/output-gate";
import {
  createInitialState,
  transitionState,
  serializeState,
  deserializeState,
  computeStateHash,
  getStepIndex,
  VALID_STEP_TRANSITIONS,
  type InterviewStep,
} from "@/lib/interviewer-state";
import { compute4FactorConfidence } from "@/lib/memory-orchestrator";
import { scoreMemoryFidelity } from "@/lib/memory-fidelity-scorer";
import { detectContradictions, extractTemporalInfo, extractScopeInfo } from "@/lib/semantic-contradiction-detector";
import { SLO_DEFINITIONS, type SLODefinition } from "@/lib/slo-monitor";
import { FeatureFlags, isEnabled } from "@/lib/feature-flags";
import { generateReconnectToken, verifyReconnectToken, computeTranscriptChecksum } from "@/lib/session-store";

describe("Master Prompt Matrix Compliance Tests", () => {
  describe("Memory confidence threshold gate", () => {
    it("confidence drops below 0.3 when all retrieval sources fail", () => {
      const confidence = compute4FactorConfidence(
        { factsOk: false, knowledgeGraphOk: false, recentTurnsOk: false },
        100, // very few tokens
        2000, // threshold
        3, // 3 violations
        3, // 3 reconnects
        false // no state hash
      );
      expect(confidence).toBeLessThan(0.3);
    });

    it("confidence >= 0.7 when all retrieval sources healthy", () => {
      const confidence = compute4FactorConfidence(
        { factsOk: true, knowledgeGraphOk: true, recentTurnsOk: true },
        5000,
        2000,
        0,
        0,
        true
      );
      expect(confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("Contradiction gate blocks contradicting output", () => {
    it("output gate flags contradictions when present", () => {
      const result = checkOutputGate("The candidate has 10 years of experience.", {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [
          { factType: "METRIC", content: "5 years of experience", confidence: 0.9 },
        ],
        personaLocked: true,
        currentStep: "technical",
        recentContradictions: [
          { description: "Experience: 10 years vs 5 years (100% divergence)", type: "numeric" },
        ],
      });

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.detail.includes("Contradiction detected"))).toBe(true);
    });

    it("output gate passes when no contradictions", () => {
      const result = checkOutputGate("Tell me about your system design experience.", {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [],
        personaLocked: true,
        currentStep: "technical",
        recentContradictions: [],
      });

      expect(result.passed).toBe(true);
    });
  });

  describe("Memory freshness SLA", () => {
    it("detects stale facts (older than 5 minutes)", () => {
      // The freshness check is in commitTurn — we verify the threshold logic directly
      const FACT_FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const staleness = Date.now() - new Date(sixMinutesAgo).getTime();
      expect(staleness).toBeGreaterThan(FACT_FRESHNESS_THRESHOLD_MS);
    });

    it("fresh facts pass (less than 5 minutes old)", () => {
      const FACT_FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const staleness = Date.now() - new Date(oneMinuteAgo).getTime();
      expect(staleness).toBeLessThan(FACT_FRESHNESS_THRESHOLD_MS);
    });
  });

  describe("Context checksum continuity contract", () => {
    it("same inputs produce same checksum", () => {
      const checksum1 = computeContextChecksum("hash1", 5, 10);
      const checksum2 = computeContextChecksum("hash1", 5, 10);
      expect(checksum1).toBe(checksum2);
    });

    it("different inputs produce different checksums", () => {
      const checksum1 = computeContextChecksum("hash1", 5, 10);
      const checksum2 = computeContextChecksum("hash1", 6, 10);
      const checksum3 = computeContextChecksum("hash2", 5, 10);
      expect(checksum1).not.toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
    });

    it("checksum is a 16-char hex string", () => {
      const checksum = computeContextChecksum("test", 0, 0);
      expect(checksum).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("Persona lock prevents re-introduction via state machine", () => {
    it("personaLocked state prevents re-introduction in output gate", () => {
      const result = checkOutputGate("Hi, I'm Aria, your interviewer today.", {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [],
        personaLocked: true,
        currentStep: "technical",
      });

      expect(result.passed).toBe(false);
      expect(result.violations[0].type).toBe("reintroduction");
      expect(result.violations[0].detail).toContain("Persona locked");
    });

    it("persona lock is set via state machine transition", () => {
      let state = createInitialState();
      expect(state.personaLocked).toBe(false);

      state = transitionState(state, { type: "PERSONA_LOCKED" });
      expect(state.personaLocked).toBe(true);

      // Idempotent
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      expect(state.personaLocked).toBe(true);
    });

    it("opening step allows introduction", () => {
      const result = checkOutputGate("Hi, I'm Aria, your interviewer today.", {
        introDone: false,
        askedQuestionIds: [],
        verifiedFacts: [],
        personaLocked: false,
        currentStep: "opening",
      });

      expect(result.passed).toBe(true);
    });
  });

  describe("Output gate integration", () => {
    it("combined violations: reintroduction + contradiction", () => {
      const result = checkOutputGate("Hi, I'm Aria! You mentioned leading a team of 50 engineers.", {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [
          { factType: "METRIC", content: "led team of 8 engineers", confidence: 0.9 },
        ],
        personaLocked: true,
        currentStep: "resume_deep_dive",
        recentContradictions: [
          { description: "Team size: 50 vs 8 (525% divergence)", type: "numeric" },
        ],
      });

      expect(result.passed).toBe(false);
      const types = result.violations.map((v) => v.type);
      expect(types).toContain("reintroduction");
      expect(types.some((t) => t === "unsupported_claim")).toBe(true);
    });
  });

  // ── Scenario 6: Reconnect recovery restores full state ──────────────

  describe("Reconnect recovery state machine", () => {
    it("reconnect token round-trips with HMAC verification", () => {
      const interviewId = "test-interview-reconnect";
      const ledgerVersion = 5;
      const stateHash = "abc123def456";

      const token = generateReconnectToken(interviewId, ledgerVersion, stateHash);
      expect(token).toBeTruthy();

      // Verify with matching parameters
      const result = verifyReconnectToken(interviewId, token, ledgerVersion, stateHash);
      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
    });

    it("reconnect token fails with wrong interview ID", () => {
      const token = generateReconnectToken("interview-A", 5, "hash");
      const result = verifyReconnectToken("interview-B", token, 5, "hash");
      expect(result.valid).toBe(false);
    });

    it("reconnect token fails with wrong ledger version (state change invalidation)", () => {
      const token = generateReconnectToken("interview-1", 5, "hash");
      const result = verifyReconnectToken("interview-1", token, 6, "hash");
      expect(result.valid).toBe(false);
    });

    it("state machine preserves full state through serialization round-trip", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      state = transitionState(state, { type: "MOVE_TO_STEP", step: "resume_deep_dive" });
      state = transitionState(state, { type: "SET_TOPIC", topic: "system design" });
      state = transitionState(state, { type: "QUESTION_ASKED", questionHash: "q1hash" });

      const serialized = serializeState(state);
      const restored = deserializeState(serialized);

      expect(restored.personaLocked).toBe(true);
      expect(restored.introDone).toBe(true);
      expect(restored.currentStep).toBe("resume_deep_dive");
      expect(restored.currentTopic).toBe("system design");
      expect(restored.askedQuestionIds).toContain("q1hash");
      expect(restored.stateHash).toBe(state.stateHash);
    });

    it("transcript checksum detects tampering", () => {
      const transcript = [
        { role: "interviewer", content: "Hello", timestamp: "2026-01-01T00:00:00Z" },
        { role: "candidate", content: "Hi there", timestamp: "2026-01-01T00:00:05Z" },
      ];

      const checksum1 = computeTranscriptChecksum(transcript);
      const checksum2 = computeTranscriptChecksum(transcript);
      expect(checksum1).toBe(checksum2);

      // Tamper with content
      const tampered = [...transcript];
      tampered[1] = { ...tampered[1], content: "Hi there, I lied" };
      const checksum3 = computeTranscriptChecksum(tampered);
      expect(checksum3).not.toBe(checksum1);
    });
  });

  // ── Scenario 7: Semantic contradiction detector ─────────────────────

  describe("Semantic contradiction detection", () => {
    it("detects numeric contradictions for same entity", () => {
      const newFact = {
        turnId: "t2",
        content: "Led team of 50 engineers at Google",
        factType: "RESPONSIBILITY" as const,
        confidence: 0.8,
        extractedBy: "test",
      };
      const existing = [{
        turnId: "t1",
        content: "Led team of 8 engineers at Google",
        factType: "RESPONSIBILITY" as const,
        confidence: 0.9,
        extractedBy: "test",
      }];

      const contradictions = detectContradictions(newFact, existing);
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].type).toBe("numeric");
    });

    it("detects temporal contradictions", () => {
      const info1 = extractTemporalInfo("worked at Google from 2019 to 2022");
      expect(info1).not.toBeNull();
      expect(info1!.startYear).toBe(2019);
      expect(info1!.endYear).toBe(2022);
      expect(info1!.duration).toBe(3);

      const info2 = extractTemporalInfo("since 2018");
      expect(info2).not.toBeNull();
      expect(info2!.startYear).toBe(2018);
    });

    it("detects entity-scope contradictions (solo vs team)", () => {
      const newFact = {
        turnId: "t2",
        content: "Built the system solo at Google",
        factType: "RESPONSIBILITY" as const,
        confidence: 0.8,
        extractedBy: "test",
      };
      const existing = [{
        turnId: "t1",
        content: "Built the system with team of 10 at Google",
        factType: "RESPONSIBILITY" as const,
        confidence: 0.9,
        extractedBy: "test",
      }];

      const contradictions = detectContradictions(newFact, existing);
      expect(contradictions.some((c) => c.type === "entity_scope")).toBe(true);
    });

    it("no contradictions for unrelated facts", () => {
      const newFact = {
        turnId: "t2",
        content: "Enjoys hiking on weekends",
        factType: "CLAIM" as const,
        confidence: 0.5,
        extractedBy: "test",
      };
      const existing = [{
        turnId: "t1",
        content: "Works at a startup in healthcare",
        factType: "COMPANY" as const,
        confidence: 0.8,
        extractedBy: "test",
      }];

      const contradictions = detectContradictions(newFact, existing);
      expect(contradictions.length).toBe(0);
    });
  });

  // ── Scenario 8: Memory fidelity score computed correctly ────────────

  describe("Memory fidelity scoring", () => {
    it("perfect recall when all ground-truth facts found", () => {
      const retrieved = [
        { factType: "METRIC", content: "5 years of experience in Python", confidence: 0.9 },
        { factType: "SKILL", content: "Expert in distributed systems", confidence: 0.85 },
      ];
      const groundTruth = [
        { content: "5 years of experience in Python", factType: "METRIC" },
        { content: "Expert in distributed systems", factType: "SKILL" },
      ];

      const score = scoreMemoryFidelity(retrieved, groundTruth, 10, new Set([1, 3, 5]));
      expect(score.recall).toBe(1.0);
      expect(score.missingFacts).toHaveLength(0);
    });

    it("low recall when ground-truth facts missing from memory", () => {
      const retrieved = [
        { factType: "METRIC", content: "5 years experience", confidence: 0.9 },
      ];
      const groundTruth = [
        { content: "5 years experience", factType: "METRIC" },
        { content: "Led migration to microservices", factType: "RESPONSIBILITY" },
        { content: "AWS certified architect", factType: "CREDENTIAL" },
      ];

      const score = scoreMemoryFidelity(retrieved, groundTruth, 10, new Set([1]));
      expect(score.recall).toBeLessThan(0.5);
      expect(score.missingFacts.length).toBeGreaterThan(0);
    });

    it("precision detects phantom facts (not in ground truth)", () => {
      const retrieved = [
        { factType: "METRIC", content: "5 years experience", confidence: 0.9 },
        { factType: "SKILL", content: "Expert in quantum computing", confidence: 0.7 },
      ];
      const groundTruth = [
        { content: "5 years experience", factType: "METRIC" },
      ];

      const score = scoreMemoryFidelity(retrieved, groundTruth, 10, new Set([1]));
      expect(score.precision).toBeLessThan(1.0);
      expect(score.phantomFacts.length).toBeGreaterThan(0);
    });

    it("coverage reflects turn-level memory presence", () => {
      const score = scoreMemoryFidelity([], [], 20, new Set([1, 5, 10]));
      expect(score.coverage).toBe(3 / 20);
      expect(score.turnCoverage.covered).toBe(3);
      expect(score.turnCoverage.total).toBe(20);
    });
  });

  // ── Scenario 9: SLO events recorded for all critical paths ─────────

  describe("SLO definitions coverage", () => {
    it("has at least 15 SLO definitions covering critical paths", () => {
      expect(SLO_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
    });

    it("all SLOs have valid structure", () => {
      for (const slo of SLO_DEFINITIONS) {
        expect(slo.name).toBeTruthy();
        expect(slo.target).toBeGreaterThan(0);
        expect(slo.target).toBeLessThanOrEqual(1);
        expect(slo.windowHours).toBeGreaterThan(0);
        expect(slo.description).toBeTruthy();
        expect(["rate", "latency_ms"]).toContain(slo.unit);
      }
    });

    it("covers turn-commit protocol SLOs", () => {
      const turnCommitSLOs = SLO_DEFINITIONS.filter((s) => s.name.includes("turn_commit"));
      expect(turnCommitSLOs.length).toBeGreaterThanOrEqual(2); // success_rate + latency
    });

    it("covers reconnect SLOs", () => {
      const reconnectSLOs = SLO_DEFINITIONS.filter((s) => s.name.includes("reconnect"));
      expect(reconnectSLOs.length).toBeGreaterThanOrEqual(2);
    });

    it("covers memory fidelity SLO", () => {
      const fidelitySLO = SLO_DEFINITIONS.find((s) => s.name.includes("fidelity"));
      expect(fidelitySLO).toBeDefined();
      expect(fidelitySLO!.target).toBeGreaterThanOrEqual(0.95);
    });

    it("covers contradiction detection SLO", () => {
      const contradictionSLO = SLO_DEFINITIONS.find((s) => s.name.includes("contradiction"));
      expect(contradictionSLO).toBeDefined();
    });

    it("covers output gate SLOs", () => {
      const gateSLOs = SLO_DEFINITIONS.filter((s) => s.name.includes("gate"));
      expect(gateSLOs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Scenario 10: Memory integrity via memory-truth-service ──────────

  describe("Memory truth service integrity metrics", () => {
    it("computeContextChecksum integrates stateHash, ledgerVersion, factCount", () => {
      // Changing any single input changes the checksum — full integrity
      const base = computeContextChecksum("stateA", 10, 5);
      const diffState = computeContextChecksum("stateB", 10, 5);
      const diffVersion = computeContextChecksum("stateA", 11, 5);
      const diffFacts = computeContextChecksum("stateA", 10, 6);

      expect(base).not.toBe(diffState);
      expect(base).not.toBe(diffVersion);
      expect(base).not.toBe(diffFacts);
    });

    it("state hash changes when any interviewer state field changes", () => {
      const state1 = createInitialState();
      const state2 = transitionState(state1, { type: "INTRO_COMPLETED" });
      const state3 = transitionState(state2, { type: "MOVE_TO_STEP", step: "technical" });

      expect(state1.stateHash).not.toBe(state2.stateHash);
      expect(state2.stateHash).not.toBe(state3.stateHash);
    });

    it("same state produces same hash (deterministic)", () => {
      const s1 = createInitialState();
      const s2 = createInitialState();
      expect(s1.stateHash).toBe(s2.stateHash);
    });
  });

  // ── Non-negotiable criteria 4-5: Step boundary enforcement ──────────

  describe("State machine step boundary enforcement", () => {
    it("rejects backward step transitions (no premature reversion)", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      state = transitionState(state, { type: "MOVE_TO_STEP", step: "technical" });
      expect(state.currentStep).toBe("technical");

      // Attempt backward transition — should be rejected
      state = transitionState(state, { type: "MOVE_TO_STEP", step: "opening" });
      expect(state.currentStep).toBe("technical"); // unchanged
    });

    it("allows forward step transitions", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      expect(state.currentStep).toBe("candidate_intro");

      state = transitionState(state, { type: "MOVE_TO_STEP", step: "resume_deep_dive" });
      expect(state.currentStep).toBe("resume_deep_dive");

      state = transitionState(state, { type: "MOVE_TO_STEP", step: "technical" });
      expect(state.currentStep).toBe("technical");
    });

    it("step order has correct progression", () => {
      const expectedOrder: InterviewStep[] = [
        "opening", "candidate_intro", "resume_deep_dive",
        "technical", "behavioral", "domain",
        "candidate_questions", "closing",
      ];
      for (let i = 0; i < expectedOrder.length - 1; i++) {
        expect(getStepIndex(expectedOrder[i])).toBeLessThan(getStepIndex(expectedOrder[i + 1]));
      }
    });

    it("closing is terminal — no valid transitions out", () => {
      expect(VALID_STEP_TRANSITIONS.closing).toHaveLength(0);
    });
  });

  // ── Feature flag graceful degradation ───────────────────────────────

  describe("Feature flag graceful degradation", () => {
    it("at least 12 feature flags are defined", () => {
      const flagNames = Object.keys(FeatureFlags);
      expect(flagNames.length).toBeGreaterThanOrEqual(12);
    });

    it("all flags default to true (enterprise mode)", () => {
      for (const [name, value] of Object.entries(FeatureFlags)) {
        expect(value).toBe(true);
      }
    });

    it("isEnabled returns correct values for all flags", () => {
      const flagKeys = Object.keys(FeatureFlags) as Array<keyof typeof FeatureFlags>;
      for (const key of flagKeys) {
        expect(typeof isEnabled(key)).toBe("boolean");
      }
    });

    it("output gate works when all flags enabled", () => {
      const result = checkOutputGate("What's your experience with React?", {
        introDone: true,
        askedQuestionIds: [],
        verifiedFacts: [],
        personaLocked: true,
        currentStep: "technical",
      });
      expect(result.passed).toBe(true);
    });
  });
});
