import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireRole: vi.fn(async () => { throw new actual.AuthError("Forbidden: insufficient permissions", 403); }) };
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GET as compliance } from "@/app/api/admin/compliance-report/route";
import { GET as scorecard } from "@/app/api/admin/continuity-scorecard/route";
import { GET as proctoring } from "@/app/api/admin/proctoring-events/route";

describe("admin routes require the admin role", () => {
  it("compliance-report returns 403 for a non-admin", async () => {
    const res = await compliance();
    expect(res.status).toBe(403);
  });
  it("continuity-scorecard returns 403 for a non-admin", async () => {
    const res = await scorecard();
    expect(res.status).toBe(403);
  });
  it("proctoring-events returns 403 for a non-admin", async () => {
    const res = await proctoring(new Request("http://localhost/api/admin/proctoring-events") as never);
    expect(res.status).toBe(403);
  });
});
