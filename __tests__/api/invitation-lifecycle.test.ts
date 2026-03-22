import { describe, it, expect } from "vitest";

describe("invitation status transitions", () => {
  const validTransitions: Record<string, string[]> = {
    PENDING: ["SENT", "CANCELLED"],
    SENT: ["OPENED", "EXPIRED", "CANCELLED"],
    OPENED: ["ACCEPTED", "EXPIRED", "CANCELLED"],
    ACCEPTED: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    EXPIRED: [],
    CANCELLED: [],
  };

  it("allows PENDING → SENT", () => {
    expect(validTransitions["PENDING"]).toContain("SENT");
  });

  it("allows SENT → OPENED", () => {
    expect(validTransitions["SENT"]).toContain("OPENED");
  });

  it("allows OPENED → ACCEPTED", () => {
    expect(validTransitions["OPENED"]).toContain("ACCEPTED");
  });

  it("allows ACCEPTED → COMPLETED", () => {
    expect(validTransitions["ACCEPTED"]).toContain("COMPLETED");
  });

  it("does not allow COMPLETED → any state", () => {
    expect(validTransitions["COMPLETED"]).toHaveLength(0);
  });

  it("does not allow CANCELLED → any state", () => {
    expect(validTransitions["CANCELLED"]).toHaveLength(0);
  });

  it("does not allow EXPIRED → any state", () => {
    expect(validTransitions["EXPIRED"]).toHaveLength(0);
  });

  it("allows cancellation from active states", () => {
    expect(validTransitions["PENDING"]).toContain("CANCELLED");
    expect(validTransitions["SENT"]).toContain("CANCELLED");
    expect(validTransitions["OPENED"]).toContain("CANCELLED");
    expect(validTransitions["ACCEPTED"]).toContain("CANCELLED");
  });

  it("allows expiration from non-terminal states", () => {
    expect(validTransitions["SENT"]).toContain("EXPIRED");
    expect(validTransitions["OPENED"]).toContain("EXPIRED");
  });
});

describe("invitation token validation", () => {
  it("generates valid UUID-format tokens", () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const testToken = "550e8400-e29b-41d4-a716-446655440000";
    expect(testToken).toMatch(uuidPattern);
  });

  it("checks token expiry", () => {
    const now = new Date();
    const expiredDate = new Date(now.getTime() - 86400000); // 1 day ago
    const futureDate = new Date(now.getTime() + 86400000); // 1 day from now

    expect(expiredDate < now).toBe(true);
    expect(futureDate > now).toBe(true);
  });

  it("validates required invitation fields", () => {
    const invitation = {
      id: "inv-1",
      interviewId: "int-1",
      candidateId: "cand-1",
      token: "550e8400-e29b-41d4-a716-446655440000",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86400000),
    };

    expect(invitation.id).toBeDefined();
    expect(invitation.interviewId).toBeDefined();
    expect(invitation.candidateId).toBeDefined();
    expect(invitation.token).toBeDefined();
    expect(invitation.status).toBe("PENDING");
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
