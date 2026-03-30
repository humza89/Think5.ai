import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Voice-Init Server-Authoritative askedQuestions Tests
 *
 * Verifies that reconnect prompt uses server InterviewerState.askedQuestionIds
 * over client-provided askedQuestions.
 */

// Set required env vars before any imports
process.env.VOICE_RELAY_URL = "wss://test-relay.example.com";
process.env.RELAY_JWT_SECRET = "test-jwt-secret-for-voice-init-tests";

// Feature flags
const featureFlags: Record<string, boolean> = {};
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (flag: string) => featureFlags[flag] ?? true,
}));

// Track what buildReconnectSystemPrompt receives
let capturedPromptArgs: Record<string, unknown> | null = null;
vi.mock("@/lib/aria-prompts", () => ({
  buildAriaVoicePrompt: vi.fn().mockReturnValue("base prompt"),
  buildReconnectSystemPrompt: vi.fn().mockImplementation((_base: string, args: Record<string, unknown>) => {
    capturedPromptArgs = args;
    return "reconnect prompt";
  }),
  planToSystemContext: vi.fn().mockReturnValue("plan context"),
}));

// Mock session store
const mockGetSessionState = vi.fn();
vi.mock("@/lib/session-store", () => ({
  getSessionState: (...args: unknown[]) => mockGetSessionState(...args),
  saveSessionState: vi.fn().mockResolvedValue(undefined),
  generateReconnectToken: vi.fn().mockReturnValue("server-token"),
  swapSessionLock: vi.fn().mockResolvedValue({ acquired: true, ownerToken: "lock-owner-1" }),
  acquireSessionLock: vi.fn().mockResolvedValue({ acquired: true, ownerToken: "lock-owner-1" }),
  refreshSessionTTL: vi.fn().mockResolvedValue(undefined),
  recordHeartbeat: vi.fn().mockResolvedValue(undefined),
}));

// Mock interviewer state
const mockDeserializeState = vi.fn();
vi.mock("@/lib/interviewer-state", () => ({
  deserializeState: (...args: unknown[]) => mockDeserializeState(...args),
  createInitialState: vi.fn().mockReturnValue({
    currentStep: "intro",
    introDone: false,
    askedQuestionIds: [],
    followupQueue: [],
    contradictionMap: [],
    pendingClarifications: [],
    topicDepthCounters: {},
    commitments: [],
    revisitAllowList: [],
    stateHash: "",
  }),
  serializeState: vi.fn().mockReturnValue("{}"),
  computeStateHash: vi.fn().mockReturnValue("hash"),
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interview: {
      findUnique: vi.fn().mockResolvedValue({
        id: "test-1",
        accessToken: "token-1",
        status: "IN_PROGRESS",
        isPractice: true, // Skip consent checks for test simplicity
        candidate: { id: "c-1", fullName: "Test User", onboardingStatus: "ACTIVE" },
        template: null,
        interviewPlan: null,
        knowledgeGraph: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/relay-jwt", () => ({
  signRelayToken: vi.fn().mockReturnValue("test-jwt-token"),
}));

vi.mock("@/lib/interview-eligibility", () => ({
  checkCandidateEligibility: vi.fn().mockReturnValue({ eligible: true }),
}));

vi.mock("@/lib/interview-state-machine", () => ({
  isValidTransition: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/interview-timeline", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/slo-monitor", () => ({
  recordSLOEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/interview-audit", () => ({
  logInterviewActivity: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/maintenance-mode", () => ({
  isMaintenanceMode: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/interview-tools", () => ({
  getInterviewTools: vi.fn().mockReturnValue([]),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe("Voice-Init — Server-Authoritative askedQuestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPromptArgs = null;
    Object.keys(featureFlags).forEach((k) => delete featureFlags[k]);
    featureFlags["STATEFUL_INTERVIEWER"] = true;
    featureFlags["TIMELINE_OBSERVABILITY"] = true;
  });

  it("uses server InterviewerState.askedQuestionIds over client askedQuestions", async () => {
    mockGetSessionState.mockResolvedValue({
      interviewId: "test-1",
      interviewerState: JSON.stringify({ currentStep: "questioning" }),
      moduleScores: [],
      questionCount: 5,
      askedQuestions: ["server-q1", "server-q2"],
    });

    mockDeserializeState.mockReturnValue({
      currentStep: "questioning",
      introDone: true,
      currentTopic: "experience",
      askedQuestionIds: ["state-q1", "state-q2", "state-q3"],
      followupQueue: [],
      contradictionMap: [],
      pendingClarifications: [],
      topicDepthCounters: {},
    });

    const { POST } = await import("@/app/api/interviews/[id]/voice-init/route");

    const request = new Request("http://localhost/api/interviews/test-1/voice-init", {
      method: "POST",
      body: JSON.stringify({
        accessToken: "token-1",
        reconnect: true,
        reconnectContext: {
          questionCount: 3,
          moduleScores: [],
          askedQuestions: ["client-q1"],
        },
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: "test-1" }) });
    expect(response.status).toBe(200);

    // Verify the prompt was built with server-authoritative askedQuestions
    expect(capturedPromptArgs).not.toBeNull();
    expect(capturedPromptArgs!.askedQuestions).toEqual(["state-q1", "state-q2", "state-q3"]);
    expect(capturedPromptArgs!.askedQuestions).not.toContain("client-q1");
  });

  it("falls back to session askedQuestions when InterviewerState is empty", async () => {
    mockGetSessionState.mockResolvedValue({
      interviewId: "test-1",
      interviewerState: null,
      moduleScores: [],
      questionCount: 5,
      askedQuestions: ["session-q1", "session-q2"],
    });

    // No InterviewerState available
    mockDeserializeState.mockReturnValue(null);

    const { POST } = await import("@/app/api/interviews/[id]/voice-init/route");

    const request = new Request("http://localhost/api/interviews/test-1/voice-init", {
      method: "POST",
      body: JSON.stringify({
        accessToken: "token-1",
        reconnect: true,
        reconnectContext: {
          questionCount: 3,
          moduleScores: [],
          askedQuestions: ["client-q1"],
        },
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: "test-1" }) });
    expect(response.status).toBe(200);

    expect(capturedPromptArgs).not.toBeNull();
    expect(capturedPromptArgs!.askedQuestions).toEqual(["session-q1", "session-q2"]);
  });
});
