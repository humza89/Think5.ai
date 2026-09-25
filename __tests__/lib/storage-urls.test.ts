import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrl = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseAdminClient: vi.fn(async () => ({ storage: { from: () => ({ createSignedUrl }) } })),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { signedResumeUrl, storageObjectPath } from "@/lib/storage-urls";

const PUBLIC = "https://abc.supabase.co/storage/v1/object/public/resumes/cand-1/cv%20final.pdf";

describe("storage-urls", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("extracts the object path from public, sign and authenticated URLs", () => {
    expect(storageObjectPath(PUBLIC)).toBe("cand-1/cv final.pdf");
    expect(storageObjectPath("https://abc.supabase.co/storage/v1/object/sign/resumes/x.pdf?token=1")).toBe("x.pdf");
    expect(storageObjectPath("https://abc.supabase.co/storage/v1/object/public/photos/x.png")).toBeNull();
    expect(storageObjectPath("/uploads/x.pdf")).toBeNull();
    expect(storageObjectPath(null)).toBeNull();
  });

  it("signs bucket objects and leaves other values untouched", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://abc.supabase.co/storage/v1/object/sign/resumes/cand-1/cv%20final.pdf?token=t" }, error: null });
    expect(await signedResumeUrl(PUBLIC)).toContain("/object/sign/resumes/");
    expect(createSignedUrl).toHaveBeenCalledWith("cand-1/cv final.pdf", 3600);
    expect(await signedResumeUrl("/uploads/x.pdf")).toBe("/uploads/x.pdf");
    expect(await signedResumeUrl(null)).toBeNull();
  });

  it("falls back to the stored value when signing fails", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    expect(await signedResumeUrl(PUBLIC)).toBe(PUBLIC);
  });

  it("does not attempt to sign without Supabase configuration", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await signedResumeUrl(PUBLIC)).toBe(PUBLIC);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
