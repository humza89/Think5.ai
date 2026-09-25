import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = (...a: unknown[]) => sendMock(...a); },
  ListObjectsV2Command: class { constructor(public input: Record<string, unknown>) {} },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  HeadObjectCommand: class {},
  DeleteObjectCommand: class {},
  DeleteObjectsCommand: class {},
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

describe("listMissingChunkIndices (T7)", () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  });

  it("reports indices with no object under the interview's chunk prefix, across pages", async () => {
    const { listMissingChunkIndices } = await import("@/lib/media-storage");
    sendMock
      .mockResolvedValueOnce({ Contents: [{ Key: "recordings/int-1/chunks/000000" }, { Key: "recordings/int-1/chunks/000002" }], IsTruncated: true, NextContinuationToken: "t1" })
      .mockResolvedValueOnce({ Contents: [{ Key: "recordings/int-1/chunks/000004" }], IsTruncated: false });
    expect(await listMissingChunkIndices("int-1", 5)).toEqual([1, 3]);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({ Prefix: "recordings/int-1/chunks/" });
    expect(sendMock.mock.calls[1][0].input).toMatchObject({ ContinuationToken: "t1" });
  });

  it("returns an empty list when nothing is expected", async () => {
    const { listMissingChunkIndices } = await import("@/lib/media-storage");
    expect(await listMissingChunkIndices("int-1", 0)).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
