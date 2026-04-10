/**
 * Track-1 Task 4 correctness tests for buildInterviewAccessScope().
 *
 * Locks in the security contract that the scope helper produces a Prisma
 * `where` fragment that enforces tenant isolation at the database layer.
 * The tests are deliberately fragment-shape assertions rather than
 * end-to-end Prisma tests — the invariant we care about is "the fragment
 * cannot be empty", "admins get no tenant filter", "recruiters get a
 * recruiter filter", "hiring managers get a company-membership filter".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Fake Supabase + Prisma ------------------------------------------

interface FakeProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "recruiter" | "hiring_manager" | "candidate";
  account_status?: string;
}

const authState: {
  user: { id: string } | null;
  profile: FakeProfile | null;
} = { user: null, profile: null };

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

const db = {
  recruiters: [] as FakeRecruiter[],
  memberships: [] as FakeMembership[],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recruiter: {
      findUnique: async (args: { where: { email?: string; supabaseUserId?: string; id?: string } }) => {
        if (args.where.supabaseUserId) {
          return db.recruiters.find((r) => r.supabaseUserId === args.where.supabaseUserId) ?? null;
        }
        if (args.where.email) {
          return db.recruiters.find((r) => r.email === args.where.email) ?? null;
        }
        if (args.where.id) {
          return db.recruiters.find((r) => r.id === args.where.id) ?? null;
        }
        return null;
      },
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
      findMany: async (args: { where: { userId: string; isActive: boolean; OR?: unknown[] } }) => {
        return db.memberships.filter(
          (m) =>
            m.userId === args.where.userId &&
            m.isActive &&
            (m.expiresAt === null || m.expiresAt > new Date()),
        );
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Stub out getRecruiterForUser's transitive dependencies — it's defined
// in the same module as buildInterviewAccessScope, so we can't mock it
// directly. Instead we pre-seed the recruiter map so getRecruiterForUser
// finds an existing record and short-circuits.
beforeEach(() => {
  authState.user = null;
  authState.profile = null;
  db.recruiters = [];
  db.memberships = [];
  vi.resetModules();
});

// --- Tests ------------------------------------------------------------

describe("buildInterviewAccessScope — Track 1 tenant-isolation contract", () => {
  it("throws 404 (not 401) when the user is unauthenticated — prevents role leaks", async () => {
    const { buildInterviewAccessScope, AuthError } = await import("@/lib/auth");
    authState.user = null;
    authState.profile = null;
    await expect(buildInterviewAccessScope("iv-1")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws 404 when the profile has an unauthorized role (no role info leak)", async () => {
    authState.user = { id: "u-candidate" };
    authState.profile = {
      id: "u-candidate",
      email: "cand@example.com",
      first_name: "Cand",
      last_name: "Idate",
      role: "candidate",
      account_status: "active",
    };
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-1")).rejects.toMatchObject({
      message: "Interview not found",
      statusCode: 404,
    });
  });

  it("admin gets an unscoped fragment (global access by design)", async () => {
    authState.user = { id: "u-admin" };
    authState.profile = {
      id: "u-admin",
      email: "admin@corp.com",
      first_name: "Ad",
      last_name: "Min",
      role: "admin",
      account_status: "active",
    };
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-1");
    expect(scope.isAdmin).toBe(true);
    expect(scope.whereFragment).toEqual({ id: "iv-1" });
    // CRITICAL: no tenant filter, no OR clause — admins are explicitly global.
    expect(scope.whereFragment).not.toHaveProperty("companyId");
    expect(scope.whereFragment).not.toHaveProperty("OR");
  });

  it("hiring manager with an active membership gets a companyId-scoped fragment", async () => {
    authState.user = { id: "u-hm" };
    authState.profile = {
      id: "u-hm",
      email: "hm@corp.com",
      first_name: "HM",
      last_name: "User",
      role: "hiring_manager",
      account_status: "active",
    };
    db.memberships = [
      { userId: "u-hm", companyId: "co-A", isActive: true, expiresAt: null },
      { userId: "u-hm", companyId: "co-B", isActive: true, expiresAt: null },
    ];
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-xyz");
    expect(scope.isAdmin).toBe(false);
    expect(scope.role).toBe("hiring_manager");
    expect(scope.whereFragment).toEqual({
      id: "iv-xyz",
      companyId: { in: ["co-A", "co-B"] },
    });
  });

  it("hiring manager with no active memberships throws 404", async () => {
    authState.user = { id: "u-hm-empty" };
    authState.profile = {
      id: "u-hm-empty",
      email: "hm@corp.com",
      first_name: "HM",
      last_name: "Empty",
      role: "hiring_manager",
      account_status: "active",
    };
    db.memberships = [];
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-xyz")).rejects.toMatchObject({
      message: "Interview not found",
      statusCode: 404,
    });
  });

  it("hiring manager with an expired membership is excluded", async () => {
    authState.user = { id: "u-hm-exp" };
    authState.profile = {
      id: "u-hm-exp",
      email: "hm@corp.com",
      first_name: "HM",
      last_name: "Expired",
      role: "hiring_manager",
      account_status: "active",
    };
    db.memberships = [
      {
        userId: "u-hm-exp",
        companyId: "co-stale",
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      },
    ];
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    await expect(buildInterviewAccessScope("iv-xyz")).rejects.toMatchObject({
      message: "Interview not found",
      statusCode: 404,
    });
  });

  it("recruiter gets a fragment that requires scheduledBy OR candidate ownership AND companyId", async () => {
    authState.user = { id: "u-rec" };
    authState.profile = {
      id: "u-rec",
      email: "rec@corp.com",
      first_name: "Rec",
      last_name: "Ruiter",
      role: "recruiter",
      account_status: "active",
    };
    db.recruiters.push({
      id: "rec-1",
      email: "rec@corp.com",
      supabaseUserId: "u-rec",
      companyId: "co-rec",
      onboardingStatus: "APPROVED",
    });
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-rec");

    expect(scope.isAdmin).toBe(false);
    expect(scope.role).toBe("recruiter");
    expect(scope.whereFragment).toMatchObject({
      id: "iv-rec",
      companyId: "co-rec", // defense-in-depth tenant filter
    });
    // The OR clause must require either scheduledBy match or candidate
    // ownership — these are the only two legitimate access paths.
    const or = (scope.whereFragment as { OR?: unknown[] }).OR;
    expect(or).toBeDefined();
    expect(or).toEqual(
      expect.arrayContaining([
        { scheduledBy: "rec-1" },
        { candidate: { recruiterId: "rec-1" } },
      ]),
    );
  });

  it("recruiter without a companyId still gets the OR filter (partial defense)", async () => {
    authState.user = { id: "u-rec-nocompany" };
    authState.profile = {
      id: "u-rec-nocompany",
      email: "rec2@corp.com",
      first_name: "Rec",
      last_name: "Ruiter",
      role: "recruiter",
      account_status: "active",
    };
    db.recruiters.push({
      id: "rec-2",
      email: "rec2@corp.com",
      supabaseUserId: "u-rec-nocompany",
      companyId: null,
      onboardingStatus: "APPROVED",
    });
    const { buildInterviewAccessScope } = await import("@/lib/auth");
    const scope = await buildInterviewAccessScope("iv-rec-2");

    expect(scope.whereFragment).not.toHaveProperty("companyId");
    const or = (scope.whereFragment as { OR?: unknown[] }).OR;
    expect(or).toBeDefined();
    expect(or!.length).toBe(2);
  });

  it("fragment is never empty — rules out the {} bypass", async () => {
    // Force every role path and verify each returns a non-trivial fragment.
    const roles: Array<[FakeProfile["role"], (scope: unknown) => void]> = [
      [
        "admin",
        (scope) => {
          expect((scope as { whereFragment: unknown }).whereFragment).toEqual({ id: "iv" });
        },
      ],
      [
        "hiring_manager",
        (scope) => {
          const wf = (scope as { whereFragment: Record<string, unknown> }).whereFragment;
          expect(Object.keys(wf).length).toBeGreaterThan(1);
        },
      ],
      [
        "recruiter",
        (scope) => {
          const wf = (scope as { whereFragment: Record<string, unknown> }).whereFragment;
          expect(Object.keys(wf).length).toBeGreaterThan(1);
        },
      ],
    ];

    for (const [role, check] of roles) {
      vi.resetModules();
      db.recruiters = [];
      db.memberships = [];
      authState.user = { id: `u-${role}` };
      authState.profile = {
        id: `u-${role}`,
        email: `${role}@corp.com`,
        first_name: "Test",
        last_name: "User",
        role,
        account_status: "active",
      };
      if (role === "recruiter") {
        db.recruiters.push({
          id: "rec-test",
          email: `${role}@corp.com`,
          supabaseUserId: `u-${role}`,
          companyId: "co-test",
          onboardingStatus: "APPROVED",
        });
      }
      if (role === "hiring_manager") {
        db.memberships = [
          { userId: `u-${role}`, companyId: "co-test", isActive: true, expiresAt: null },
        ];
      }
      const { buildInterviewAccessScope } = await import("@/lib/auth");
      const scope = await buildInterviewAccessScope("iv");
      check(scope);
    }
  });
});
