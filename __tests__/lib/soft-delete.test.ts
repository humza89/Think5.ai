import { describe, expect, it, vi } from "vitest";
import { softDeleteRewrite, withSoftDelete, SOFT_DELETE_MODELS } from "@/lib/soft-delete";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const now = () => NOW;

describe("softDeleteRewrite", () => {
  for (const model of SOFT_DELETE_MODELS) {
    it(`${model}: reads add deletedAt: null`, () => {
      expect(softDeleteRewrite(model, "findMany", { where: { status: "ACTIVE" } })).toEqual({
        operation: "findMany",
        args: { where: { status: "ACTIVE", deletedAt: null } },
      });
      expect(softDeleteRewrite(model, "findFirst", undefined)).toEqual({ operation: "findFirst", args: { where: { deletedAt: null } } });
      expect(softDeleteRewrite(model, "count", { where: { id: "x" } }).args).toEqual({ where: { id: "x", deletedAt: null } });
    });

    it(`${model}: findUnique becomes findFirst with the filter`, () => {
      expect(softDeleteRewrite(model, "findUnique", { where: { id: "x" }, include: { job: true } })).toEqual({
        operation: "findFirst",
        args: { where: { id: "x", deletedAt: null }, include: { job: true } },
      });
      expect(softDeleteRewrite(model, "findUniqueOrThrow", { where: { id: "x" } }).operation).toBe("findFirstOrThrow");
    });

    it(`${model}: delete becomes update setting deletedAt`, () => {
      expect(softDeleteRewrite(model, "delete", { where: { id: "x" } }, now)).toEqual({
        operation: "update",
        args: { where: { id: "x" }, data: { deletedAt: NOW } },
      });
      expect(softDeleteRewrite(model, "deleteMany", { where: { status: "REJECTED" } }, now)).toEqual({
        operation: "updateMany",
        args: { where: { status: "REJECTED" }, data: { deletedAt: NOW } },
      });
    });
  }

  it("includeDeleted: true bypasses the filter and is stripped", () => {
    expect(softDeleteRewrite("Candidate", "findMany", { where: { id: "x" }, includeDeleted: true })).toEqual({
      operation: "findMany",
      args: { where: { id: "x" } },
    });
    expect(softDeleteRewrite("Candidate", "findUnique", { where: { id: "x" }, includeDeleted: true })).toEqual({
      operation: "findFirst",
      args: { where: { id: "x" } },
    });
  });

  it("respects an explicit deletedAt condition (e.g. listing trashed rows)", () => {
    expect(softDeleteRewrite("Interview", "findMany", { where: { deletedAt: { not: null } } }).args).toEqual({
      where: { deletedAt: { not: null } },
    });
  });

  it("leaves other models and write operations untouched", () => {
    expect(softDeleteRewrite("Job", "findMany", { where: { a: 1 } })).toEqual({ operation: "findMany", args: { where: { a: 1 } } });
    expect(softDeleteRewrite("Job", "delete", { where: { id: "j" } })).toEqual({ operation: "delete", args: { where: { id: "j" } } });
    expect(softDeleteRewrite("Candidate", "update", { where: { id: "x" }, data: { fullName: "y" } })).toEqual({
      operation: "update",
      args: { where: { id: "x" }, data: { fullName: "y" } },
    });
  });
});

describe("withSoftDelete", () => {
  it("passes through a client without $extends (mock database)", () => {
    const mock = { candidate: { findMany: vi.fn() } };
    expect(withSoftDelete(mock as never)).toBe(mock);
  });

  it("rewrites reads in place and re-dispatches changed operations through the delegate", async () => {
    const calls: Array<{ op: string; args: unknown }> = [];
    let hook: (ctx: { model?: string; operation: string; args: Record<string, unknown>; query: (a: Record<string, unknown>) => Promise<unknown> }) => Promise<unknown>;
    const fakeExtended = {
      candidate: {
        findFirst: vi.fn(async (args: unknown) => { calls.push({ op: "findFirst", args }); return { id: "c1" }; }),
        update: vi.fn(async (args: unknown) => { calls.push({ op: "update", args }); return { id: "c1" }; }),
      },
    };
    const fakeClient = {
      $extends: vi.fn((ext: { query: { $allModels: { $allOperations: typeof hook } } }) => {
        hook = ext.query.$allModels.$allOperations;
        return fakeExtended;
      }),
    };
    const client = withSoftDelete(fakeClient as never, now);
    expect(client).toBe(fakeExtended);

    // Same operation: goes through query() with the filter added.
    const query = vi.fn(async (args: unknown) => args);
    await hook!({ model: "Candidate", operation: "findMany", args: { where: { x: 1 } }, query });
    expect(query).toHaveBeenCalledWith({ where: { x: 1, deletedAt: null } });

    // Changed operation: dispatched to the extended delegate.
    await hook!({ model: "Candidate", operation: "findUnique", args: { where: { id: "c1" } }, query });
    await hook!({ model: "Candidate", operation: "delete", args: { where: { id: "c1" } }, query });
    expect(calls).toEqual([
      { op: "findFirst", args: { where: { id: "c1", deletedAt: null } } },
      { op: "update", args: { where: { id: "c1" }, data: { deletedAt: NOW } } },
    ]);
  });
});
