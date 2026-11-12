import { afterEach, describe, expect, it, vi } from "vitest";

describe("API_BASE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
