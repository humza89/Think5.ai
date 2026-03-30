import { describe, it, expect } from "vitest";
import { computeContextChecksum } from "@/lib/session-brain";
import { createInitialState, transitionState, serializeState } from "@/lib/interviewer-state";
import { checkMemorySlots, deriveAvailableSlots, getRequiredMemorySlots } from "@/lib/memory-slot-validator";

describe("Session Brain & Turn-Commit Protocol", () => {
  describe("Context checksum computation", () => {
    it("produces deterministic checksums for same inputs", () => {
      const cs1 = computeContextChecksum("hash1", 5, 10);
      const cs2 = computeContextChecksum("hash1", 5, 10);
      expect(cs1).toBe(cs2);
    });

    it("produces different checksums for different inputs", () => {
      const cs1 = computeContextChecksum("hash1", 5, 10);
      const cs2 = computeContextChecksum("hash2", 5, 10);
      const cs3 = computeContextChecksum("hash1", 6, 10);
      expect(cs1).not.toBe(cs2);
      expect(cs1).not.toBe(cs3);
    });

    it("checksum is 16 hex chars", () => {
      const cs = computeContextChecksum("test", 0, 0);
      expect(cs).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("Memory slot validation", () => {
    it("opening step has minimal requirements", () => {
      const slots = getRequiredMemorySlots("opening");
      const requiredSlots = slots.filter((s) => s.required);
      expect(requiredSlots).toHaveLength(0);
    });

    it("technical step requires skills and recent turns", () => {
      const slots = getRequiredMemorySlots("technical");
      const requiredSlots = slots.filter((s) => s.required);
      const requiredNames = requiredSlots.map((s) => s.slot);
      expect(requiredNames).toContain("technical_skills");
      expect(requiredNames).toContain("recent_turns");
      expect(requiredNames).toContain("current_topic_context");
    });

    it("passes when all required slots are filled", () => {
      const result = checkMemorySlots("technical", {
        candidate_name: false,
        resume_facts: true,
        recent_turns: true,
        technical_skills: true,
        current_topic_context: true,
        behavioral_signals: false,
        knowledge_graph: false,
        module_scores: true,
        commitments: false,
        contradictions: false,
      });
      expect(result.allPresent).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("fails when required slots are missing", () => {
      const result = checkMemorySlots("technical", {
        candidate_name: false,
        resume_facts: false,
        recent_turns: false,
        technical_skills: false,
        current_topic_context: false,
        behavioral_signals: false,
        knowledge_graph: false,
        module_scores: false,
        commitments: false,
        contradictions: false,
      });
      expect(result.allPresent).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });

  describe("Slot derivation from memory packet", () => {
    it("correctly identifies available slots from packet", () => {
      const slots = deriveAvailableSlots({
        verifiedFacts: [
          { factType: "TECHNICAL_SKILL", content: "React" },
          { factType: "COMPANY", content: "Google" },
        ],
        recentTurns: [{ content: "I worked on search" }],
        knowledgeGraph: { nodes: [] },
        currentTopic: "system design",
        moduleScores: [{ module: "technical", score: 7 }],
        commitments: [{ fulfilled: false }],
        contradictions: [],
        candidateProfile: { strengths: ["communication"] },
      });

      expect(slots.technical_skills).toBe(true);
      expect(slots.resume_facts).toBe(true);
      expect(slots.recent_turns).toBe(true);
      expect(slots.knowledge_graph).toBe(true);
      expect(slots.current_topic_context).toBe(true);
      expect(slots.module_scores).toBe(true);
      expect(slots.candidate_name).toBe(true);
    });

    it("correctly identifies missing slots", () => {
      const slots = deriveAvailableSlots({
        verifiedFacts: [],
        recentTurns: [],
        knowledgeGraph: null,
        currentTopic: "",
        moduleScores: [],
        commitments: [],
        contradictions: [],
        candidateProfile: null,
      });

      expect(slots.technical_skills).toBe(false);
      expect(slots.resume_facts).toBe(false);
      expect(slots.recent_turns).toBe(false);
      expect(slots.knowledge_graph).toBe(false);
      expect(slots.current_topic_context).toBe(false);
    });
  });

  describe("State machine integration with session brain", () => {
    it("persona locks after first AI turn", () => {
      let state = createInitialState();
      expect(state.personaLocked).toBe(false);

      // Simulate what session-brain does after committing an AI turn
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      state = transitionState(state, { type: "INTRO_COMPLETED" });

      expect(state.personaLocked).toBe(true);
      expect(state.introDone).toBe(true);
      expect(state.currentStep).toBe("candidate_intro");
    });

    it("state survives serialization through turn-commit cycle", () => {
      let state = createInitialState();
      state = transitionState(state, { type: "PERSONA_LOCKED" });
      state = transitionState(state, { type: "INTRO_COMPLETED" });
      state = transitionState(state, { type: "SET_TOPIC", topic: "distributed systems" });

      const serialized = serializeState(state);

      // Simulate what happens in turn-commit: session state has interviewerState as string
      const sessionState = { interviewerState: serialized };
      expect(typeof sessionState.interviewerState).toBe("string");
      expect(sessionState.interviewerState).toContain("distributed systems");
    });
  });
});
