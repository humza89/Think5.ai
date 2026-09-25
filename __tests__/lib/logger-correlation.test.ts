import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

afterEach(() => vi.restoreAllMocks());

describe("logger correlation (T12)", () => {
  it("adds requestId, interviewId and tenantId from the request context to every line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runWithRequestContext({ requestId: "req-1", interviewId: "int-1", tenantId: "tenant-1" }, () => {
      logger.info("hello", { step: 1 });
      logger.warn("careful");
      logger.error("failed", new Error("x"), { step: 3 });
      logger.debug("dbg");
    });
    const ids = { requestId: "req-1", interviewId: "int-1", tenantId: "tenant-1" };
    expect(log).toHaveBeenCalledWith("[INFO] hello", { ...ids, step: 1 });
    expect(warn).toHaveBeenCalledWith("[WARN] careful", ids);
    expect(error).toHaveBeenCalledWith("[ERROR] failed", expect.any(Error), { ...ids, step: 3 });
    expect(log).toHaveBeenCalledWith("[DEBUG] dbg", ids);
  });

  it("lets explicit extras win over ambient ids and stays unchanged outside a request", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runWithRequestContext({ requestId: "ambient" }, () => logger.info("m", { requestId: "explicit" }));
    expect(log).toHaveBeenCalledWith("[INFO] m", { requestId: "explicit" });
    logger.info("plain");
    expect(log).toHaveBeenCalledWith("[INFO] plain", "");
  });
});
