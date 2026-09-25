import { describe, expect, it } from "vitest";
import { getRequestContext, requestIdFrom, runWithRequestContext, supportId, REQUEST_ID_HEADER } from "@/lib/request-context";

describe("request-context (T12)", () => {
  it("is empty outside a request scope", () => {
    expect(getRequestContext()).toEqual({});
  });

  it("scopes ids to the async continuation and merges nested contexts", async () => {
    await runWithRequestContext({ requestId: "req-1", tenantId: "tenant-a" }, async () => {
      expect(getRequestContext()).toEqual({ requestId: "req-1", tenantId: "tenant-a" });
      await runWithRequestContext({ interviewId: "int-1", tenantId: undefined }, async () => {
        await Promise.resolve();
        expect(getRequestContext()).toEqual({ requestId: "req-1", tenantId: "tenant-a", interviewId: "int-1" });
      });
      expect(getRequestContext()).toEqual({ requestId: "req-1", tenantId: "tenant-a" });
    });
    expect(getRequestContext()).toEqual({});
  });

  it("does not leak between concurrent scopes", async () => {
    const seen: string[] = [];
    await Promise.all(
      ["a", "b", "c"].map((id, i) =>
        runWithRequestContext({ requestId: id }, async () => {
          await new Promise((r) => setTimeout(r, 5 * (3 - i)));
          seen.push(getRequestContext().requestId ?? "none");
        }),
      ),
    );
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("reads the x-request-id header", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
    expect(requestIdFrom(new Headers({ "x-request-id": "abc" }))).toBe("abc");
    expect(requestIdFrom(new Headers())).toBeUndefined();
  });

  it("builds a short Support ID from interview and request ids", () => {
    expect(supportId("cmg1abcdefgh", "5f2c1d9e-0000-4000-8000-000000000000")).toBe("cmg1abcd-5f2c1d9e");
    expect(supportId("cmg1abcdefgh", undefined)).toBe("cmg1abcd");
    expect(supportId(undefined, "5f2c1d9e-0000")).toBe("5f2c1d9e");
    expect(supportId(undefined, undefined)).toBeNull();
  });
});
