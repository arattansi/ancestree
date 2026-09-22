import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { territoriesAt } from "@/lib/native-land.server";

const fetchMock = vi.fn();

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("territoriesAt", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NATIVE_LAND_API_KEY", "test-key");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks NLD for the territories at the point, with the key, never cached", async () => {
    fetchMock.mockResolvedValue(
      answer([
        {
          type: "Feature",
          properties: {
            Name: "Mississauga",
            Slug: "mississauga",
            description: "https://native-land.ca/maps/territories/mississauga/",
          },
        },
      ]),
    );

    expect(await territoriesAt(43.70011, -79.4163)).toEqual([
      {
        name: "Mississauga",
        url: "https://native-land.ca/maps/territories/mississauga/",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://native-land.ca/api/index.php",
    );
    expect(url.searchParams.get("maps")).toBe("territories");
    expect(url.searchParams.get("position")).toBe("43.70011,-79.4163");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(init.cache).toBe("no-store");
  });

  it("doesn't ask without a key", async () => {
    vi.stubEnv("NATIVE_LAND_API_KEY", "");
    expect(await territoriesAt(43.7, -79.4)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null when NLD refuses, and never logs the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(answer({ error: "Invalid API key" }, 403));

    expect(await territoriesAt(43.7, -79.4)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("test-key");
  });

  it("is null when NLD can't be reached or answers with something else", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect(await territoriesAt(43.7, -79.4)).toBeNull();

    fetchMock.mockResolvedValueOnce(answer({ error: "Try again later" }));
    expect(await territoriesAt(43.7, -79.4)).toBeNull();
  });
});
