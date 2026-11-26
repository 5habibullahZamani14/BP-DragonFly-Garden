import { afterEach, describe, expect, it, vi } from "vitest";

describe("API_BASE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses same-origin requests for production even when a local API override is present", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_BASE", "http://127.0.0.1:5000");

    const { API_BASE } = await import("@/lib/api");

    expect(API_BASE).toBe("");
  });

  it("uses the Vite proxy for a loopback development backend", async () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_API_BASE", "http://127.0.0.1:5000");

    const { API_BASE } = await import("@/lib/api");

    expect(API_BASE).toBe("");
  });

  it("does not cache API reads so event-triggered refreshes get current data", async () => {
    vi.stubEnv("PROD", false);
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTables } = await import("@/lib/api");

    await fetchTables();

    expect(fetchMock).toHaveBeenCalledWith(
      "/tables",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
