import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(resolve(process.cwd(), "public", "sw.js"), "utf8");

type MockRequest = {
  url: string;
  method: string;
  mode: string;
  destination: string;
};

type MockFetchEvent = {
  request: MockRequest;
  respondWith: (response: Promise<unknown> | unknown) => void;
};

describe("service worker request caching", () => {
  let fetchHandler: ((event: MockFetchEvent) => void) | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
  let cacheStorage: {
    match: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };
  let cache: { put: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fetchHandler = undefined;
    cache = { put: vi.fn().mockResolvedValue(undefined) };
    cacheStorage = {
      match: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(cache),
    };
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({}),
    });

    const self = {
      location: { origin: "https://restaurant.test" },
      addEventListener: (type: string, listener: (event: MockFetchEvent) => void) => {
        if (type === "fetch") fetchHandler = listener;
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    };

    runInNewContext(serviceWorkerSource, {
      self,
      caches: cacheStorage,
      fetch: fetchMock,
      URL,
      Response,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const dispatchFetch = async (request: MockRequest) => {
    let response: Promise<unknown> | unknown;
    if (!fetchHandler) throw new Error("The service worker did not register a fetch handler.");
    fetchHandler({
      request,
      respondWith: (value) => {
        response = value;
      },
    });
    return await response;
  };

  it.each([
    "/health",
    "/ready",
    "/menu?qr_code=table-1",
    "/orders",
    "/tables",
    "/payments",
    "/management",
  ])("always checks the network for backend endpoint %s", async (path) => {
    const request = {
      url: `https://restaurant.test${path}`,
      method: "GET",
      mode: "cors",
      destination: "",
    };

    await dispatchFetch(request);

    expect(fetchMock).toHaveBeenCalledWith(request);
    expect(cacheStorage.match).not.toHaveBeenCalled();
    expect(cacheStorage.open).not.toHaveBeenCalled();
  });

  it("refreshes static assets from the network and keeps an offline cache copy", async () => {
    const request = {
      url: "https://restaurant.test/assets/app.js",
      method: "GET",
      mode: "same-origin",
      destination: "script",
    };

    await dispatchFetch(request);

    expect(fetchMock).toHaveBeenCalledWith(request);
    expect(cacheStorage.open).toHaveBeenCalledWith("dragonfly-garden-pwa-v3");
    expect(cache.put).toHaveBeenCalledWith(request, expect.objectContaining({}));
  });
});
