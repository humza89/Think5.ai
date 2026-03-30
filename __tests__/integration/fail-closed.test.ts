import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fail-Closed Behavior Tests
 *
 * Verifies that when FAIL_CLOSED_PRODUCTION is enabled, validation failures
 * return HTTP 503 instead of being silently swallowed ("non-fatal").
 *
 * These tests verify the error handling paths in voice/route.ts checkpoint action.
 */

// Mock report-generator (transitively imports Resend which requires API key)
vi.mock("@/lib/report-generator", () => ({
  generateReportInBackground: vi.fn().mockResolvedValue(undefined),
}));

// Mock email modules
vi.mock("@/lib/email/resend", () => ({
  default: { emails: { send: vi.fn() } },
}));

// Mock feature flags — default all off, tests enable selectively
const featureFlags: Record<string, boolean> = {};
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (flag: string) => featureFlags[flag] ?? false,
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findUnique: vi.fn().mockResolvedValue({
        id: "test-1",
        accessToken: "token-1",
        status: "IN_PROGRESS",
        candidate: { id: "c-1", fullName: "Test", onboardingStatus: "ACTIVE" },
        template: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    interviewFact: {
      findMany: vi.fn().mockRejectedValue(new Error("Simulated fact lookup failure")),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// Mock session store
vi.mock("@/lib/session-store", () => ({
  getSessionState: vi.fn().mockResolvedValue({
    interviewId: "test-1",
    moduleScores: [],
    questionCount: 0,
    checkpointDigest: "old-digest",
    lastTurnIndex: 5,
    ledgerVersion: 5,
    stateHash: "abc",
    interviewerState: JSON.stringify({
      currentStep: "questioning",
      introDone: true,
      currentTopic: "experience",
      askedQuestionIds: [],
      followupQueue: [],
      contradictionMap: [],
      pendingClarifications: [],
      topicDepthCounters: {},
      commitments: [],
      revisitAllowList: [],
      stateHash: "abc",
    }),
  }),
  saveSessionState: vi.fn().mockResolvedValue(undefined),
  refreshSessionTTL: vi.fn().mockResolvedValue(undefined),
  recordHeartbeat: vi.fn().mockResolvedValue(undefined),
  computeTranscriptChecksum: vi.fn().mockReturnValue("new-digest"),
}));

// Mock conversation ledger
vi.mock("@/lib/conversation-ledger", () => ({
  getLedgerSnapshot: vi.fn().mockResolvedValue({ latestTurnIndex: 5, turnCount: 6 }),
  diffTurns: vi.fn().mockReturnValue([
    { role: "candidate", content: "I worked at Google", timestamp: new Date().toISOString() },
    { role: "assistant", content: "That's interesting. Tell me more about your role?", timestamp: new Date().toISOString() },
  ]),
  appendTurns: vi.fn().mockResolvedValue([{ turnIndex: 7 }]),
  getFullTranscript: vi.fn().mockResolvedValue([]),
  verifyContentIntegrity: vi.fn().mockResolvedValue([]),
}));

// Mock other dependencies
vi.mock("@/lib/interview-eligibility", () => ({
  checkCandidateEligibility: vi.fn().mockReturnValue({ eligible: true }),
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/interview-timeline", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/transcript-validator", () => ({
  validateTranscript: vi.fn().mockReturnValue({ valid: true, issues: [] }),
  repairTranscript: vi.fn().mockReturnValue({ repaired: [], repairs: [] }),
}));

vi.mock("@/lib/error-classification", () => ({
  classifyError: vi.fn().mockReturnValue({ message: "test error", title: "TEST", recoverable: true }),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock("@/lib/interview-audit", () => ({
  logInterviewActivity: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/proctoring-normalizer", () => ({
  persistProctoringEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/interview-state-machine", () => ({
  isValidTransition: vi.fn().mockReturnValue(true),
}));

// Mock interviewer-state to throw on deserialization (simulates corruption)
const realDeserialize = vi.fn();
vi.mock("@/lib/interviewer-state", () => ({
  deserializeState: (...args: unknown[]) => realDeserialize(...args),
  serializeState: vi.fn().mockReturnValue("{}"),
  transitionState: vi.fn().mockImplementation((state: unknown) => state),
  hashQuestion: vi.fn().mockReturnValue("q-hash"),
  createInitialState: vi.fn().mockReturnValue({
    currentStep: "intro",
    introDone: false,
    currentTopic: "",
    askedQuestionIds: [],
    followupQueue: [],
    contradictionMap: [],
    pendingClarifications: [],
    topicDepthCounters: {},
    commitments: [],
    revisitAllowList: [],
    stateHash: "",
  }),
}));

// Mock output gate
vi.mock("@/lib/output-gate", () => ({
  checkOutputGateWithAction: vi.fn().mockImplementation(() => {
    throw new Error("Simulated output gate failure");
  }),
}));

// Mock grounding gate
vi.mock("@/lib/grounding-gate", () => ({
  verifyGrounding: vi.fn().mockReturnValue({ grounded: true, score: 1.0, totalClaims: 0, supportedClaims: [], unsupportedClaims: [] }),
}));

// Mock fact extractor
vi.mock("@/lib/fact-extractor", () => ({
  extractFactsImmediate: vi.fn().mockReturnValue([]),
  isContradiction: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/maintenance-mode", () => ({
  isMaintenanceMode: vi.fn().mockResolvedValue(false),
  getMaintenanceMessage: vi.fn(),
  maintenanceResponse: vi.fn(),
}));

describe("Fail-Closed Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations (clearAllMocks only clears history, not implementations)
    realDeserialize.mockReset();
    // Reset all flags
    Object.keys(featureFlags).forEach((k) => delete featureFlags[k]);
  });

  it("output gate error returns 503 when FAIL_CLOSED_PRODUCTION enabled", async () => {
    featureFlags["FAIL_CLOSED_PRODUCTION"] = true;
    featureFlags["OUTPUT_GATE_BLOCKING"] = true;
    featureFlags["STATEFUL_INTERVIEWER"] = true;

    // deserializeState succeeds so we get to the output gate
    realDeserialize.mockReturnValue({
      currentStep: "questioning",
      introDone: true,
      currentTopic: "experience",
      askedQuestionIds: [],
      followupQueue: [],
      contradictionMap: [],
      pendingClarifications: [],
      topicDepthCounters: {},
      commitments: [],
      revisitAllowList: [],
      stateHash: "abc",
    });

    // Import the route handler
    const { POST } = await import("@/app/api/interviews/[id]/voice/route");

    const request = new Request("http://localhost/api/interviews/test-1/voice", {
      method: "POST",
      body: JSON.stringify({
        action: "checkpoint",
        accessToken: "token-1",
        transcript: [
          { role: "candidate", content: "Hello", timestamp: new Date().toISOString() },
          { role: "assistant", content: "Hi there, how are you?", timestamp: new Date().toISOString() },
        ],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: "test-1" }) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.error).toContain("Output gate");
    expect(body.code).toBe("GATE_ERROR");
    expect(body.recoverable).toBe(true);
  });

  it("state machine error returns 503 when FAIL_CLOSED_PRODUCTION enabled", async () => {
    featureFlags["FAIL_CLOSED_PRODUCTION"] = true;
    featureFlags["STATEFUL_INTERVIEWER"] = true;

    // deserializeState throws to simulate corrupt state
    realDeserialize.mockImplementation(() => {
      throw new Error("Invalid interviewer state: introDone must be boolean");
    });

    const { POST } = await import("@/app/api/interviews/[id]/voice/route");

    // Use "test-2" to avoid checkpoint rate limiter collision with test 1.
    // checkpointTimestamps is a module-level Map that persists across tests —
    // test 1 wrote "test-1" into it, so reusing the same ID would hit the
    // 2-second rate limit and return { ok: true, throttled: true } (200).
    const request = new Request("http://localhost/api/interviews/test-2/voice", {
      method: "POST",
      body: JSON.stringify({
        action: "checkpoint",
        accessToken: "token-1",
        transcript: [
          { role: "assistant", content: "Tell me about yourself?", timestamp: new Date().toISOString() },
        ],
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: "test-2" }) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.code).toBe("STATE_ERROR");
    expect(body.recoverable).toBe(true);
  });
});
