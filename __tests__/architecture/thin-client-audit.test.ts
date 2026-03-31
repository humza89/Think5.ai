/**
 * REM-2 Static Analysis: Thin I/O Terminal Audit
 *
 * Proves that hooks/useVoiceInterview.ts is a thin I/O terminal with
 * zero orchestration logic. All orchestration belongs on the server.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "hooks/useVoiceInterview.ts");
const hookSource = readFileSync(HOOK_PATH, "utf-8");

// ── Helpers ───────────────────────────────────────────────────────────

/** Extract all import-from paths (handles both `import … from "…"` and `import "…"`) */
function extractImportPaths(source: string): string[] {
  const importRegex = /from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    paths.push(match[1] ?? match[2]);
  }
  return paths;
}

/** Extract the UseVoiceInterviewReturn interface body */
function extractReturnInterface(source: string): string {
  const start = source.indexOf("export interface UseVoiceInterviewReturn {");
  if (start === -1) throw new Error("UseVoiceInterviewReturn interface not found");
  let depth = 0;
  let i = source.indexOf("{", start);
  const begin = i;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) break;
  }
  return source.slice(begin, i + 1);
}

/** Extract member names from an interface body string */
function extractMemberNames(interfaceBody: string): string[] {
  // Match property names (foo:) and method names (foo(...):)
  const memberRegex = /^\s*(\w+)\s*[:(]/gm;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = memberRegex.exec(interfaceBody)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

// ── 1. No server-side orchestration imports ──────────────────────────

describe("REM-2: Thin I/O Terminal — No orchestration imports", () => {
  const importPaths = extractImportPaths(hookSource);

  const forbiddenImports = [
    "@/lib/memory-orchestrator",
    "@/lib/fact-extractor",
    "@/lib/memory-truth-service",
    "@/lib/grounding-gate",
    "@/lib/output-gate",
    "@/lib/semantic-contradiction-detector",
    "@/lib/conversation-ledger",
    "@/lib/interviewer-state",
    "@/lib/session-brain",
  ];

  for (const forbidden of forbiddenImports) {
    it(`does NOT import ${forbidden}`, () => {
      expect(importPaths).not.toContain(forbidden);
    });
  }
});

// ── 2. No question-selection logic ───────────────────────────────────

describe("REM-2: Thin I/O Terminal — No question-selection logic", () => {
  const questionSelectionPatterns = [
    { pattern: /selectQuestion\s*\(/, label: "selectQuestion()" },
    { pattern: /chooseQuestion\s*\(/, label: "chooseQuestion()" },
    { pattern: /pickQuestion\s*\(/, label: "pickQuestion()" },
    { pattern: /nextQuestion\s*\(/, label: "nextQuestion()" },
    { pattern: /moveToModule\s*\(/, label: "moveToModule()" },
    { pattern: /selectModule\s*\(/, label: "selectModule()" },
  ];

  for (const { pattern, label } of questionSelectionPatterns) {
    it(`does NOT contain ${label}`, () => {
      expect(hookSource).not.toMatch(pattern);
    });
  }
});

// ── 3. Return type is I/O only ───────────────────────────────────────

describe("REM-2: Thin I/O Terminal — Return type is I/O only", () => {
  const interfaceBody = extractReturnInterface(hookSource);
  const memberNames = extractMemberNames(interfaceBody);

  const allowedMembers = new Set([
    // State fields
    "interviewState",
    "aiState",
    "isConnected",
    "connectionQuality",
    "isReconnecting",
    "isPaused",
    "reconnectPhase",
    "reconnectAttempt",
    "reconnectMax",
    // Data fields
    "transcript",
    "questionCount",
    "micIsSilent",
    "fallbackToText",
    "isMicEnabled",
    // I/O methods
    "startInterview",
    "endInterview",
    "sendTextMessage",
    "toggleMic",
    "reconnect",
    "retryVoice",
    "pauseInterview",
    "resumeInterview",
    "getSessionSnapshot",
  ]);

  it("contains only allowed I/O members", () => {
    const disallowed = memberNames.filter((name) => !allowedMembers.has(name));
    expect(disallowed).toEqual([]);
  });

  const forbiddenMethods = [
    "selectQuestion",
    "assembleMemory",
    "composeContext",
    "extractFacts",
    "runGates",
  ];

  for (const method of forbiddenMethods) {
    it(`does NOT expose ${method}() in return type`, () => {
      expect(memberNames).not.toContain(method);
    });
  }
});

// ── 4. Architecture contract comment exists ──────────────────────────

describe("REM-2: Thin I/O Terminal — Architecture contract comment", () => {
  it('contains "THIN I/O TERMINAL" or "Thin I/O Terminal" in the header', () => {
    const hasThinTerminal =
      hookSource.includes("THIN I/O TERMINAL") ||
      hookSource.includes("Thin I/O Terminal");
    expect(hasThinTerminal).toBe(true);
  });
});

// ── 5. No direct Prisma/DB access ───────────────────────────────────

describe("REM-2: Thin I/O Terminal — No direct DB access", () => {
  const importPaths = extractImportPaths(hookSource);

  it("does NOT import prisma", () => {
    const hasPrisma = importPaths.some(
      (p) => p.includes("prisma") || p === "@prisma/client"
    );
    expect(hasPrisma).toBe(false);
  });

  it("does NOT reference PrismaClient directly", () => {
    expect(hookSource).not.toMatch(/new\s+PrismaClient/);
  });
});
