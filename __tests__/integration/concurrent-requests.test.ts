import { describe, it, expect } from "vitest";
import {
  createInitialState,
  transitionState,
  hashQuestion,
} from "@/lib/interviewer-state";
import type { StateEvent } from "@/lib/interviewer-state";

describe("Concurrent Request Behavior", () => {
  it("concurrent state transitions produce deterministic results", async () => {
    /**
     * Simulate N independent "threads" applying the same event sequence
     * to identical starting states. Because transitionState is pure,
     * every thread must converge to the same final state and hash.
     */
    const CONCURRENCY = 20;

    const events: StateEvent[] = [
      { type: "INTRO_COMPLETED" },
      { type: "MOVE_TO_STEP", step: "candidate_intro" },
      { type: "SET_TOPIC", topic: "distributed-systems" },
      { type: "QUESTION_ASKED", questionHash: "q-arch-1" },
      { type: "TOPIC_DEPTH_INCREMENT", topic: "distributed-systems" },
      { type: "MOVE_TO_STEP", step: "resume_deep_dive" },
      { type: "QUESTION_ASKED", questionHash: "q-resume-1" },
      {
        type: "FOLLOW_UP_FLAGGED",
        item: { topic: "scalability", reason: "interesting", priority: "high" },
      },
      { type: "MOVE_TO_STEP", step: "technical" },
      {
        type: "COMMITMENT_MADE",
        commitment: { id: "c1", description: "Probe caching", turnId: "t10" },
      },
      { type: "COMMITMENT_FULFILLED", commitmentId: "c1" },
    ];

    // Run all replays concurrently via Promise.all
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        Promise.resolve().then(() => {
          let state = createInitialState();
          for (const event of events) {
            state = transitionState(state, event);
          }
          return state;
        })
      )
    );

    // Every result must have the same stateHash
    const hashes = new Set(results.map((s) => s.stateHash));
    expect(hashes.size).toBe(1);

    // All states must be structurally identical
    for (const result of results) {
      expect(result.currentStep).toBe("technical");
      expect(result.introDone).toBe(true);
      expect(result.currentTopic).toBe("distributed-systems");
      expect(result.askedQuestionIds).toEqual(["q-arch-1", "q-resume-1"]);
      expect(result.commitments[0].fulfilled).toBe(true);
    }
  });

  it("rapid INTRO_COMPLETED + QUESTION_ASKED events are idempotent", () => {
    /**
     * Applying the same INTRO_COMPLETED or QUESTION_ASKED event multiple
     * times must not duplicate side-effects. INTRO_COMPLETED sets a boolean,
     * QUESTION_ASKED deduplicates by hash.
     */
    let state = createInitialState();

    // Fire INTRO_COMPLETED 5 times rapidly
    for (let i = 0; i < 5; i++) {
      state = transitionState(state, { type: "INTRO_COMPLETED" });
    }
    expect(state.introDone).toBe(true);
    expect(state.currentStep).toBe("candidate_intro"); // only advanced once

    // Fire same QUESTION_ASKED 10 times
    for (let i = 0; i < 10; i++) {
      state = transitionState(state, { type: "QUESTION_ASKED", questionHash: "q-dup" });
    }
    expect(state.askedQuestionIds).toEqual(["q-dup"]); // only one entry
    expect(state.askedQuestionIds).toHaveLength(1);
  });

  it("10 concurrent hashQuestion calls return consistent results", async () => {
    /**
     * hashQuestion is a pure function with normalization. Running it
     * concurrently on the same input must always produce the same hash.
     */
    const input = "Tell me about your experience with distributed systems at scale?";
    const CONCURRENCY = 10;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        Promise.resolve().then(() => hashQuestion(input))
      )
    );

    const uniqueHashes = new Set(results);
    expect(uniqueHashes.size).toBe(1);
    expect(results[0]).toBeTruthy();
    expect(results[0]).toHaveLength(12); // hashQuestion returns 12-char hex

    // Verify normalization: different whitespace/casing produces same hash
    const variants = [
      "Tell me about your experience with distributed systems at scale?",
      "  tell me about your experience with distributed systems at scale?  ",
      "TELL ME ABOUT YOUR EXPERIENCE WITH DISTRIBUTED SYSTEMS AT SCALE?",
      "Tell  me   about  your experience   with distributed  systems at  scale?",
    ];

    const variantHashes = variants.map((v) => hashQuestion(v));
    const uniqueVariantHashes = new Set(variantHashes);
    expect(uniqueVariantHashes.size).toBe(1);
  });
});
