import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn<(args: unknown) => Promise<unknown>>();
const update = vi.fn<(args: unknown) => Promise<unknown>>(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { apiKey: { findFirst: (args: unknown) => findFirst(args), update: (args: unknown) => update(args) } } }));

import { authenticateApiKey, generateApiKey, hashApiKey, parseBearer } from "@/lib/api-key-auth";

describe("api-key-auth (T10)", () => {
  it("generates t5_<prefix>_<secret> keys and hashes them", () => {
    const k = generateApiKey();
    expect(k.plaintext).toMatch(/^t5_[a-f0-9]{8}_[A-Za-z0-9_-]{32}$/);
    expect(k.keyHash).toBe(hashApiKey(k.plaintext));
    expect(parseBearer(`Bearer ${k.plaintext}`)).toBe(k.plaintext);
    expect(parseBearer("Basic abc")).toBeNull();
  });

  it("authenticates a stored key, touches lastUsedAt, and refuses wrong, revoked, expired and under-scoped keys", async () => {
    const k = generateApiKey();
    const row = { id: "key-1", userId: "u1", companyId: "co", name: "HRIS", prefix: k.prefix, keyHash: k.keyHash, scopes: ["read"], revokedAt: null, expiresAt: null };
    findFirst.mockResolvedValue(row);
    const req = (auth?: string) => new Request("http://x/api/v1/me", { headers: auth ? { authorization: auth } : {} });
    await expect(authenticateApiKey(req(`Bearer ${k.plaintext}`))).resolves.toMatchObject({ keyId: "key-1", scopes: ["read"] });
    expect(update).toHaveBeenCalledWith({ where: { id: "key-1" }, data: { lastUsedAt: expect.any(Date) } });
    await expect(authenticateApiKey(req())).rejects.toMatchObject({ statusCode: 401, code: "API_KEY_MISSING" });
    await expect(authenticateApiKey(req(`Bearer t5_${k.prefix}_wrongsecret`))).rejects.toMatchObject({ statusCode: 401, code: "API_KEY_INVALID" });
    await expect(authenticateApiKey(req(`Bearer ${k.plaintext}`), "write")).rejects.toMatchObject({ statusCode: 403, code: "API_KEY_SCOPE" });
    findFirst.mockResolvedValueOnce({ ...row, revokedAt: new Date() });
    await expect(authenticateApiKey(req(`Bearer ${k.plaintext}`))).rejects.toMatchObject({ code: "API_KEY_REVOKED" });
    findFirst.mockResolvedValueOnce({ ...row, expiresAt: new Date(Date.now() - 1000) });
    await expect(authenticateApiKey(req(`Bearer ${k.plaintext}`))).rejects.toMatchObject({ code: "API_KEY_EXPIRED" });
    findFirst.mockResolvedValueOnce(null);
    await expect(authenticateApiKey(req(`Bearer t5_deadbeef_x`))).rejects.toMatchObject({ code: "API_KEY_INVALID" });
  });
});
