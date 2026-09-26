/**
 * Deterministic seed for the Phase 0 golden E2E suite (T0).
 *
 * Creates the recruiter and candidate identities through the real Supabase
 * Auth admin API (GoTrue) plus the `profiles` table, then upserts fixed-ID
 * Prisma rows so every authenticated golden route resolves. Idempotent: safe
 * to run repeatedly against the same stack.
 *
 * No auth bypass is introduced: Playwright signs these accounts in through the
 * normal /auth/signin form afterwards (see e2e/golden/auth.setup.ts).
 *
 * Safety: refuses to touch a non-local Supabase host unless
 * E2E_SEED_ALLOW_REMOTE=true is set explicitly for a dedicated test project.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { E2E_FIXTURES } from "../e2e/fixtures/e2e-fixtures";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to seed the E2E stack`);
  return value;
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = requireEnv("DATABASE_URL");
const password = requireEnv("E2E_SEED_PASSWORD");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"]);
const supabaseHost = new URL(supabaseUrl).hostname;
if (!LOCAL_HOSTS.has(supabaseHost) && process.env.E2E_SEED_ALLOW_REMOTE !== "true") {
  throw new Error(
    `Refusing to seed non-local Supabase host "${supabaseHost}". ` +
      "Set E2E_SEED_ALLOW_REMOTE=true only for a dedicated non-production project.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type Role = "recruiter" | "candidate" | "admin";

interface Identity {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** Value stored on profiles.onboarding_status; the proxy gates on it. */
  profileOnboardingStatus: string;
}

// T9: dedicated account for the identity spec (password rotation, MFA factors).
const identityAccount: Identity = {
  email: E2E_FIXTURES.identity.email,
  firstName: E2E_FIXTURES.identity.firstName,
  lastName: E2E_FIXTURES.identity.lastName,
  role: "recruiter",
  profileOnboardingStatus: "completed",
};

// T14: platform admin for the approval specs. No Recruiter row → global scope.
const adminAccount: Identity = {
  email: E2E_FIXTURES.admin.email,
  firstName: E2E_FIXTURES.admin.firstName,
  lastName: E2E_FIXTURES.admin.lastName,
  role: "admin",
  profileOnboardingStatus: "completed",
};

// T14: recruiter parked at PENDING_APPROVAL; the proxy sends them to
// /recruiter/onboarding/status until an admin approves.
const pendingRecruiterAccount: Identity = {
  email: E2E_FIXTURES.pendingRecruiter.email,
  firstName: E2E_FIXTURES.pendingRecruiter.firstName,
  lastName: E2E_FIXTURES.pendingRecruiter.lastName,
  role: "recruiter",
  profileOnboardingStatus: "pending_approval",
};

const identities: Record<"recruiter" | "candidate", Identity> = {
  recruiter: {
    email: E2E_FIXTURES.recruiter.email,
    firstName: E2E_FIXTURES.recruiter.firstName,
    lastName: E2E_FIXTURES.recruiter.lastName,
    role: "recruiter",
    profileOnboardingStatus: "completed",
  },
  candidate: {
    email: E2E_FIXTURES.candidate.email,
    firstName: E2E_FIXTURES.candidate.firstName,
    lastName: E2E_FIXTURES.candidate.lastName,
    role: "candidate",
    profileOnboardingStatus: "approved",
  },
};

async function ensureAuthUser(identity: Identity): Promise<string> {
  const metadata = {
    first_name: identity.firstName,
    last_name: identity.lastName,
    role: identity.role,
  };

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email?.toLowerCase() === identity.email);

  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: identity.email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (createError) throw createError;
  return created.user.id;
}

async function ensureProfile(userId: string, identity: Identity): Promise<void> {
  // The on_auth_user_created trigger inserts the row; upsert makes the run
  // idempotent and pins the gate-relevant columns.
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: identity.email,
      first_name: identity.firstName,
      last_name: identity.lastName,
      role: identity.role,
      email_verified: true,
      onboarding_status: identity.profileOnboardingStatus,
      account_status: "active",
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function removeSignupAccount(): Promise<void> {
  const email = E2E_FIXTURES.signup.email;
  await prisma.recruiter.deleteMany({ where: { email } });
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftover = data?.users.find((user) => user.email?.toLowerCase() === email);
  if (leftover) {
    // profiles / verification_tokens cascade from auth.users.
    const { error } = await supabase.auth.admin.deleteUser(leftover.id);
    if (error) throw error;
  }
}

async function seedPrisma(recruiterUserId: string): Promise<void> {
  const { ids, tokens, recruiter, candidate } = E2E_FIXTURES;
  const seededAt = new Date(E2E_FIXTURES.seededAt);
  const neverExpires = new Date(E2E_FIXTURES.neverExpires);

  const company = {
    name: "Northwind Robotics",
    industry: "Robotics",
    companySize: "51-200",
    website: "https://northwind.example",
    headquarters: "Austin, TX",
    description: "Autonomous warehouse robotics for mid-market logistics.",
    createdAt: seededAt,
  };
  await prisma.client.upsert({
    where: { id: ids.company },
    create: { id: ids.company, ...company },
    update: company,
  });

  const recruiterRow = {
    supabaseUserId: recruiterUserId,
    name: recruiter.name,
    email: recruiter.email,
    title: "Head of Talent",
    companyId: ids.company,
    onboardingStep: 5,
    onboardingCompleted: true,
    onboardingStatus: "APPROVED" as const,
    createdAt: seededAt,
  };
  await prisma.recruiter.upsert({
    where: { id: ids.recruiter },
    create: { id: ids.recruiter, ...recruiterRow },
    update: recruiterRow,
  });

  const candidates = [
    {
      id: ids.candidate,
      fullName: candidate.fullName,
      email: candidate.email,
      currentTitle: "Senior Backend Engineer",
      currentCompany: "Harbor Systems",
      headline: "Go and Postgres engineer building event-driven platforms",
      location: "Austin, TX",
      skills: ["Go", "PostgreSQL", "Kubernetes", "gRPC"],
      experienceYears: 7,
      status: "INTERVIEWED" as const,
      onboardingCompleted: true,
      onboardingStep: 5,
      onboardingStatus: "APPROVED" as const,
      approvedAt: seededAt,
      invitationSource: "recruiter_invited",
    },
    {
      id: ids.candidateB,
      fullName: "Priya Natarajan",
      email: "e2e-priya@think5.test",
      currentTitle: "Platform Engineer",
      currentCompany: "Lumen Grid",
      headline: "Platform engineer focused on developer tooling",
      location: "Denver, CO",
      skills: ["TypeScript", "AWS", "Terraform"],
      experienceYears: 5,
      status: "CONTACTED" as const,
      onboardingCompleted: false,
      onboardingStep: 1,
      onboardingStatus: "PROFILE_STARTED" as const,
      approvedAt: null,
      invitationSource: "recruiter_invited",
    },
    {
      id: ids.candidateC,
      fullName: "Samuel Okafor",
      email: "e2e-samuel@think5.test",
      currentTitle: "Site Reliability Engineer",
      currentCompany: "Cobalt Freight",
      headline: "SRE keeping logistics APIs at four nines",
      location: "Chicago, IL",
      skills: ["Python", "Kubernetes", "Prometheus"],
      experienceYears: 6,
      status: "SOURCED" as const,
      onboardingCompleted: false,
      onboardingStep: 0,
      onboardingStatus: "INVITED" as const,
      approvedAt: null,
      invitationSource: "recruiter_invited",
    },
  ];
  for (const row of candidates) {
    const { id, ...data } = row;
    await prisma.candidate.upsert({
      where: { id },
      create: { id, recruiterId: ids.recruiter, createdAt: seededAt, ...data },
      update: { recruiterId: ids.recruiter, createdAt: seededAt, ...data },
    });
  }

  const job = {
    title: "Senior Backend Engineer (Go)",
    description:
      "Own the fleet-coordination services that schedule thousands of robots across customer warehouses. " +
      "You will design Go services on Postgres and Kubernetes, and partner with hardware teams on telemetry contracts.",
    location: "Austin, TX",
    department: "Engineering",
    industry: "Robotics",
    status: "ACTIVE" as const,
    employmentType: "FULL_TIME" as const,
    remoteType: "HYBRID" as const,
    salaryMin: 165000,
    salaryMax: 195000,
    salaryCurrency: "USD",
    experienceMin: 5,
    experienceMax: 10,
    urgencyLevel: 4,
    skillsRequired: ["Go", "PostgreSQL", "Kubernetes"],
    postedAt: seededAt,
    recruiterId: ids.recruiter,
    companyId: ids.company,
    createdAt: seededAt,
  };
  await prisma.job.upsert({
    where: { id: ids.job },
    create: { id: ids.job, ...job },
    update: job,
  });

  const application = {
    candidateId: ids.candidate,
    jobId: ids.job,
    status: "INTERVIEWING" as const,
    appliedAt: seededAt,
    source: "invited",
    createdAt: seededAt,
  };
  await prisma.application.upsert({
    where: { id: ids.application },
    create: { id: ids.application, ...application },
    update: application,
  });

  // Invitation first: the welcome interview links back to it, and the real
  // /interview/accept flow in auth.setup.ts consumes this token.
  const invitation = {
    recruiterId: ids.recruiter,
    candidateId: ids.candidate,
    jobId: ids.job,
    token: tokens.invitation,
    status: "SENT" as const,
    sentAt: seededAt,
    expiresAt: neverExpires,
    email: candidate.email,
    createdAt: seededAt,
    // Reset acceptance state so each run starts from the invitation.
    openedAt: null,
    acceptedAt: null,
  };
  await prisma.interviewInvitation.upsert({
    where: { id: ids.invitation },
    create: { id: ids.invitation, ...invitation },
    update: invitation,
  });

  const welcomeInterview = {
    candidateId: ids.candidate,
    scheduledBy: ids.recruiter,
    jobId: ids.job,
    companyId: ids.company,
    invitationId: ids.invitation,
    type: "TECHNICAL" as const,
    mode: "GENERAL_PROFILE" as const,
    status: "PENDING" as const,
    voiceProvider: "gemini-live",
    accessToken: tokens.interviewAccess,
    accessTokenExpiresAt: neverExpires,
    invitedEmail: candidate.email,
    readinessVerified: false,
    createdAt: seededAt,
  };
  await prisma.interview.upsert({
    where: { id: ids.interviewWelcome },
    create: { id: ids.interviewWelcome, ...welcomeInterview },
    update: welcomeInterview,
  });

  const completedInterview = {
    candidateId: ids.candidate,
    scheduledBy: ids.recruiter,
    jobId: ids.job,
    companyId: ids.company,
    type: "BEHAVIORAL" as const,
    mode: "GENERAL_PROFILE" as const,
    status: "COMPLETED" as const,
    voiceProvider: "gemini-live",
    accessToken: tokens.completedAccess,
    accessTokenExpiresAt: neverExpires,
    invitedEmail: candidate.email,
    startedAt: seededAt,
    completedAt: new Date(seededAt.getTime() + 28 * 60 * 1000),
    createdAt: seededAt,
  };
  await prisma.interview.upsert({
    where: { id: ids.interviewCompleted },
    create: { id: ids.interviewCompleted, ...completedInterview },
    update: completedInterview,
  });

  // T14: golden-path interview. Reset to PENDING on every seed so the
  // invite → interview → report spec always starts from the same state.
  const goldenInterview = {
    candidateId: ids.candidate,
    scheduledBy: ids.recruiter,
    jobId: ids.job,
    companyId: ids.company,
    type: "TECHNICAL" as const,
    mode: "GENERAL_PROFILE" as const,
    status: "PENDING" as const,
    voiceProvider: "gemini-live",
    accessToken: tokens.goldenAccess,
    accessTokenExpiresAt: neverExpires,
    invitedEmail: candidate.email,
    readinessVerified: false,
    transcript: Prisma.DbNull,
    startedAt: null,
    completedAt: null,
    reportStatus: null,
    createdAt: seededAt,
  };
  await prisma.interviewReport.deleteMany({ where: { interviewId: ids.interviewGolden } });
  await prisma.interview.upsert({
    where: { id: ids.interviewGolden },
    create: { id: ids.interviewGolden, ...goldenInterview },
    update: goldenInterview,
  });
}

async function main(): Promise<void> {
  const recruiterUserId = await ensureAuthUser(identities.recruiter);
  await ensureProfile(recruiterUserId, identities.recruiter);
  const candidateUserId = await ensureAuthUser(identities.candidate);
  await ensureProfile(candidateUserId, identities.candidate);
  await seedPrisma(recruiterUserId);

  const identityUserId = await ensureAuthUser(identityAccount);
  await ensureProfile(identityUserId, identityAccount);
  const identityRow = {
    supabaseUserId: identityUserId,
    name: E2E_FIXTURES.identity.name,
    email: identityAccount.email,
    title: "Talent Partner",
    companyId: E2E_FIXTURES.ids.company,
    onboardingStep: 5,
    onboardingCompleted: true,
    onboardingStatus: "APPROVED" as const,
    createdAt: new Date(E2E_FIXTURES.seededAt),
  };
  await prisma.recruiter.upsert({
    where: { id: "e2e-recruiter-sam" },
    create: { id: "e2e-recruiter-sam", ...identityRow },
    update: identityRow,
  });

  // T14: admin + pending recruiter for the approval specs.
  const adminUserId = await ensureAuthUser(adminAccount);
  await ensureProfile(adminUserId, adminAccount);

  const pendingUserId = await ensureAuthUser(pendingRecruiterAccount);
  await ensureProfile(pendingUserId, pendingRecruiterAccount);
  const pendingRow = {
    supabaseUserId: pendingUserId,
    name: E2E_FIXTURES.pendingRecruiter.name,
    email: pendingRecruiterAccount.email,
    title: "Recruiting Coordinator",
    companyId: E2E_FIXTURES.ids.company,
    onboardingStep: 5,
    onboardingCompleted: true,
    onboardingStatus: "PENDING_APPROVAL" as const,
    createdAt: new Date(E2E_FIXTURES.seededAt),
  };
  await prisma.recruiter.upsert({
    where: { id: E2E_FIXTURES.ids.pendingRecruiter },
    create: { id: E2E_FIXTURES.ids.pendingRecruiter, ...pendingRow },
    update: pendingRow,
  });

  // T14: the signup spec creates this account through the real form; remove
  // any leftover from an interrupted run so the spec starts clean.
  await removeSignupAccount();

  console.log(
    [
      "E2E seed complete",
      `  supabase: ${supabaseUrl}`,
      `  recruiter: ${identities.recruiter.email} (${recruiterUserId})`,
      `  candidate: ${identities.candidate.email} (${candidateUserId})`,
      `  identity: ${identityAccount.email} (${identityUserId})`,
      `  admin: ${adminAccount.email} (${adminUserId})`,
      `  pending recruiter: ${pendingRecruiterAccount.email} (${pendingUserId})`,
      `  job: ${E2E_FIXTURES.routes.jobDetail}`,
      `  interview (welcome): ${E2E_FIXTURES.routes.interviewWelcome}`,
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error("E2E seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
