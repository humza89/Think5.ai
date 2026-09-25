import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiFetch, ApiError } from "@/lib/api-client";

type FetchMock = ReturnType<typeof vi.fn>;

function lastInit(mock: FetchMock): RequestInit {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return call[1] as RequestInit;
}

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers ?? {}).get(name);
}

describe("api client", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "sb-x=1; csrf-token-client=abc123" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the CSRF header and JSON body on POST", async () => {
    await api.post("/api/jobs", { title: "x" });
    const init = lastInit(fetchMock);
    expect(init.method).toBe("POST");
    expect(headerOf(init, "x-csrf-token")).toBe("abc123");
    expect(headerOf(init, "content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
    expect(init.credentials).toBe("same-origin");
  });

  it("adds it on PUT, PATCH and DELETE too", async () => {
    await api.put("/api/a", {});
    expect(headerOf(lastInit(fetchMock), "x-csrf-token")).toBe("abc123");
    await api.patch("/api/a", {});
    expect(headerOf(lastInit(fetchMock), "x-csrf-token")).toBe("abc123");
    await api.delete("/api/a");
    expect(headerOf(lastInit(fetchMock), "x-csrf-token")).toBe("abc123");
  });

  it("does not add it on GET", async () => {
    await api.get("/api/jobs");
    const init = lastInit(fetchMock);
    expect(headerOf(init, "x-csrf-token")).toBeNull();
    expect(init.method).toBe("GET");
  });

  it("throws ApiError with status and parsed error body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "nope" }), { status: 403 }));
    const failure = api.post("/api/jobs", {});
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 403, message: "nope", body: { error: "nope" } });
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Gateway timeout", { status: 504, statusText: "Gateway Timeout" }));
    await expect(api.get("/api/slow")).rejects.toMatchObject({ status: 504, message: "Gateway Timeout", body: "Gateway timeout" });
  });

  it("sends FormData without forcing a JSON content type", async () => {
    const form = new FormData();
    form.append("file", "x");
    await api.post("/api/upload", form);
    const init = lastInit(fetchMock);
    expect(init.body).toBe(form);
    expect(headerOf(init, "content-type")).toBeNull();
    expect(headerOf(init, "x-csrf-token")).toBe("abc123");
  });

  it("returns null for an empty 204 body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api.delete("/api/jobs/1")).toBeNull();
  });

  describe("apiFetch (drop-in)", () => {
    it("adds the header on mutations and preserves caller headers and body", async () => {
      await apiFetch("/api/jobs", { method: "post", headers: { "Content-Type": "application/json", "X-Custom": "1" }, body: "{}" });
      const init = lastInit(fetchMock);
      expect(headerOf(init, "x-csrf-token")).toBe("abc123");
      expect(headerOf(init, "x-custom")).toBe("1");
      expect(init.body).toBe("{}");
      expect(init.credentials).toBe("same-origin");
    });

    it("does not override a CSRF header the caller already set", async () => {
      await apiFetch("/api/jobs", { method: "POST", headers: { "x-csrf-token": "explicit" } });
      expect(headerOf(lastInit(fetchMock), "x-csrf-token")).toBe("explicit");
    });

    it("leaves GET requests untouched apart from credentials", async () => {
      await apiFetch("/api/jobs");
      const init = lastInit(fetchMock);
      expect(init.headers).toBeUndefined();
      expect(init.credentials).toBe("same-origin");
    });

    it("omits the header when no CSRF cookie exists yet", async () => {
      vi.stubGlobal("document", { cookie: "" });
      await apiFetch("/api/auth/register", { method: "POST" });
      expect(headerOf(lastInit(fetchMock), "x-csrf-token")).toBeNull();
    });
  });
});
