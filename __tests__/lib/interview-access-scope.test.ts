/**
 * buildInterviewAccessScope — tenant-isolation contract.
 *
 * Fragment-shape assertions: the fragment is never empty, admins get no
 * tenant filter, recruiters get the scheduledBy/candidate-owner filter (plus
 * companyId when they have one), hiring managers get an active-membership
 * company filter, and every failure is a uniform 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "recruiter" | "hiring_manager" | "candidate";
  account_status?: string;
}

const authState: { user: { id: string } | null; profile: FakeProfile | null } = {
  user: null,
  profile: null,
};

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.user },
        error: authState.user ? null : new Error("no user"),
      }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: authState.profile }),
        }),
      }),
    }),
  }),
}));

interface FakeRecruiter {
  id: string;
  email: string;
  supabaseUserId: string | null;
  companyId: string | null;
  onboardingStatus?: string;
}

interface FakeMembership {
  userId: string;
  companyId: string;
  isActive: boolean;
  expiresAt: Date | null;
}

const db = { recruiters: [] as FakeRecruiter[], memberships: [] as FakeMembership[] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recruiter: {
      findUnique: async (args: { where: { email?: string; supabaseUserId?: string; id?: string } }) => {
        if (args.where.supabaseUserId) return db.recruiters.find((r) => r.supabaseUserId === args.where.supabaseUserId) ?? null;
        if (args.where.email) return db.recruiters.find((r) => r.email === args.where.email) ?? null;
        if (args.where.id) return db.recruiters.find((r) => r.id === args.where.id) ?? null;
        return null;
      },
      findFirst: async (args: { where: { supabaseUserId?: string } }) =>
        db.recruiters.find((r) => r.supabaseUserId === args.where.supabaseUserId) ?? null,
      update: async (args: { where: { id: string }; data: Partial<FakeRecruiter> }) => {
        const row = db.recruiters.find((r) => r.id === args.where.id);
        if (!row) throw new Error("recruiter not found");
        Object.assign(row, args.data);
        return row;
      },
      create: async (args: { data: FakeRecruiter }) => {
        db.recruiters.push(args.data);
        return args.data;
      },
    },
    hiringManagerMembership: {
      findMany: async (args: { where: { userId: string; isActive: boolean } }) =>
        db.memberships.filter(
          (m) => m.userId === args.where.userId && m.isActive && (m.expiresAt === null || m.expiresAt > new Date()),
        ),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

function profile(role: FakeProfile["role"], id: string): FakeProfile {
  return { id, email: `${id}@corp.com`, first_name: "Test", last_name: "User", role, account_status: "active" };
}

beforeEach(() => {
  authState.user = null;
  authState.profile = null;
  db.recruiters = [];
  db.memberships = [];
  vi.resetModules();
});

describe("buildInterviewAccessScope", () => {
  it("throws AuthError when unauthenticated", async () => {
    const { buildInterviewAccessScope, AuthError } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-1")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws 404 for a role that may not read interviews (no role leak)", async () => {
    authState.user = { id: "u-cand" };
    authState.profile = profile("candidate", "u-cand");
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-1")).rejects.toMatchObject({
      message: "Interview not found",
      statusCode: 404,
    });
  });

  it("admin gets an id-only fragment (global access by design)", async () => {
    authState.user = { id: "u-admin" };
    authState.profile = profile("admin", "u-admin");
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-1");
    expect(scope.isAdmin).toBe(true);
    expect(scope.role).toBe("admin");
    expect(scope.userId).toBe("u-admin");
    expect(scope.whereFragment).toEqual({ id: "iv-1" });
  });

  it("hiring manager with active memberships gets a companyId-in fragment", async () => {
    authState.user = { id: "u-hm" };
    authState.profile = profile("hiring_manager", "u-hm");
    db.memberships = [
      { userId: "u-hm", companyId: "co-A", isActive: true, expiresAt: null },
      { userId: "u-hm", companyId: "co-B", isActive: true, expiresAt: new Date(Date.now() + 60_000) },
    ];
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-xyz");
    expect(scope.isAdmin).toBe(false);
    expect(scope.role).toBe("hiring_manager");
    expect(scope.whereFragment).toEqual({ id: "iv-xyz", companyId: { in: ["co-A", "co-B"] } });
  });

  it("hiring manager with no active memberships gets 404", async () => {
    authState.user = { id: "u-hm-empty" };
    authState.profile = profile("hiring_manager", "u-hm-empty");
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-xyz")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hiring manager whose only membership is expired gets 404", async () => {
    authState.user = { id: "u-hm-exp" };
    authState.profile = profile("hiring_manager", "u-hm-exp");
    db.memberships = [{ userId: "u-hm-exp", companyId: "co-stale", isActive: true, expiresAt: new Date(Date.now() - 1000) }];
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-xyz")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("recruiter gets scheduledBy OR candidate-owner, AND companyId when attached to a company", async () => {
    authState.user = { id: "u-rec" };
    authState.profile = profile("recruiter", "u-rec");
    db.recruiters.push({ id: "rec-1", email: "u-rec@corp.com", supabaseUserId: "u-rec", companyId: "co-rec", onboardingStatus: "APPROVED" });
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-rec");
    expect(scope.isAdmin).toBe(false);
    expect(scope.role).toBe("recruiter");
    expect(scope.whereFragment).toEqual({
      id: "iv-rec",
      OR: [{ scheduledBy: "rec-1" }, { candidate: { recruiterId: "rec-1" } }],
      companyId: "co-rec",
    });
  });

  it("recruiter without a companyId still gets the OR filter", async () => {
    authState.user = { id: "u-rec2" };
    authState.profile = profile("recruiter", "u-rec2");
    db.recruiters.push({ id: "rec-2", email: "u-rec2@corp.com", supabaseUserId: "u-rec2", companyId: null, onboardingStatus: "APPROVED" });
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-2");
    expect(scope.whereFragment).not.toHaveProperty("companyId");
    expect((scope.whereFragment as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it("never returns an empty fragment for any role", async () => {
    for (const role of ["admin", "hiring_manager", "recruiter"] as const) {
      vi.resetModules();
      db.recruiters = [];
      db.memberships = [];
      authState.user = { id: `u-${role}` };
      authState.profile = profile(role, `u-${role}`);
      if (role === "recruiter") {
        db.recruiters.push({ id: "rec-t", email: `u-${role}@corp.com`, supabaseUserId: `u-${role}`, companyId: "co-t" });
      }
      if (role === "hiring_manager") {
        db.memberships = [{ userId: `u-${role}`, companyId: "co-t", isActive: true, expiresAt: null }];
      }
      const { buildInterviewAccessScope } = await import("@/lib/auth");
      const scope = await buildInterviewAccessScope("iv");
      expect(Object.keys(scope.whereFragment).length).toBeGreaterThan(0);
      expect(scope.whereFragment).toMatchObject({ id: "iv" });
    }
  });
});
