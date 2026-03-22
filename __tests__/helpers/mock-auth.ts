import { vi } from "vitest";

export const mockUser = {
  id: "test-user-id",
  email: "test@example.com",
  role: "recruiter" as const,
};

export const mockGetAuthenticatedUser = vi.fn().mockResolvedValue(mockUser);
export const mockRequireRole = vi.fn().mockResolvedValue(mockUser);
export const mockRequireApprovedAccess = vi.fn().mockResolvedValue(mockUser);

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuthenticatedUser: mockGetAuthenticatedUser,
    requireRole: mockRequireRole,
    requireApprovedAccess: mockRequireApprovedAccess,
  };
});
