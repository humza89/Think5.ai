import { describe, expect, it } from "vitest";
import { CONTROL_PLANE_OWNS, MEDIA_PLANE_MAY_HOLD, assertPlaneMayHold, planeFor } from "@/lib/contracts/planes";

describe("control/media plane boundary", () => {
  it("assigns every named asset to exactly one plane", () => {
    const overlap = CONTROL_PLANE_OWNS.filter((asset) => (MEDIA_PLANE_MAY_HOLD as readonly string[]).includes(asset));
    expect(overlap).toEqual([]);
    for (const asset of CONTROL_PLANE_OWNS) expect(planeFor(asset)).toBe("control");
    for (const asset of MEDIA_PLANE_MAY_HOLD) expect(planeFor(asset)).toBe("media");
    expect(planeFor("something_else")).toBeNull();
  });

  it("lets the media plane hold only transient assets", () => {
    expect(() => assertPlaneMayHold("media", "transient_audio")).not.toThrow();
    expect(() => assertPlaneMayHold("media", "avatar_session_id")).not.toThrow();
    expect(() => assertPlaneMayHold("media", "conversation_ledger")).toThrow(/belongs to the control plane/);
    expect(() => assertPlaneMayHold("control", "jitter_buffer")).toThrow(/belongs to the media plane/);
    expect(() => assertPlaneMayHold("media", "unknown")).toThrow(/Unknown plane asset/);
  });
});
