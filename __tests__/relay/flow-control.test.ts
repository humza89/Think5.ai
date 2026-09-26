/**
 * relay/flow-control — buffer utilisation → flow level, and the control frames.
 */

import { describe, expect, it } from "vitest";
import {
  FLOW_PAUSE_THRESHOLD,
  FLOW_SLOW_THRESHOLD,
  buildDegradedFrame,
  buildFlowFrame,
  bufferUtilization,
  flowLevelFor,
} from "../../relay/flow-control";

describe("flowLevelFor", () => {
  it("uses the 50 % / 80 % thresholds", () => {
    expect(FLOW_SLOW_THRESHOLD).toBe(0.5);
    expect(FLOW_PAUSE_THRESHOLD).toBe(0.8);
    expect(flowLevelFor(0, 100)).toBe("normal");
    expect(flowLevelFor(49, 100)).toBe("normal");
    expect(flowLevelFor(50, 100)).toBe("slow");
    expect(flowLevelFor(79, 100)).toBe("slow");
    expect(flowLevelFor(80, 100)).toBe("pause");
    expect(flowLevelFor(100, 100)).toBe("pause");
  });

  it("treats a full or zero-capacity buffer as paused", () => {
    expect(flowLevelFor(150, 100)).toBe("pause");
    expect(flowLevelFor(0, 0)).toBe("pause");
  });

  it("clamps utilisation to 0..1", () => {
    expect(bufferUtilization(-5, 100)).toBe(0);
    expect(bufferUtilization(250, 100)).toBe(1);
    expect(bufferUtilization(25, 100)).toBe(0.25);
  });
});

describe("frames", () => {
  it("builds relay.flow with level, utilisation and drop count", () => {
    expect(buildFlowFrame("slow", 60, 100, 2, 123)).toEqual({
      type: "relay.flow",
      level: "slow",
      bufferUtilization: 0.6,
      droppedThisSession: 2,
      timestamp: 123,
    });
  });

  it("builds relay.degraded for an open provider breaker", () => {
    expect(buildDegradedFrame("OPEN", 30_000, 5)).toEqual({
      type: "relay.degraded",
      reason: "provider_circuit_open",
      cooldownMs: 30_000,
      breakerState: "OPEN",
      timestamp: 5,
    });
  });
});
