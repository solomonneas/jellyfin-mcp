import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JellyfinClient } from "../src/client.js";

const fetchMock = vi.fn();

describe("JellyfinClient", () => {
  let client: JellyfinClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    client = new JellyfinClient({
      url: "http://jellyfin.test",
      apiKey: "test-key",
      verifySsl: true,
      timeout: 5000,
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends X-Emby-Token on requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ServerName: "Test", Version: "10.11.5", Id: "abc" }), {
        status: 200,
      }),
    );

    await client.getSystemInfo();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/System/Info");
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Emby-Token"]).toBe("test-key");
  });

  it("surfaces 401 with a clear message", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(client.getSystemInfo()).rejects.toThrow(/Invalid API key/);
  });

  it("url-encodes session IDs on playback control", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.pauseSession("abc/def 123");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Sessions/abc%2Fdef%20123/Playing/Pause");
  });

  it("handles 204 No Content from playback control endpoints", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.stopSession("session-1")).resolves.toBeUndefined();
  });

  it("passes scan libraryId as query param", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.scanLibraries("lib-abc");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Library/Refresh?libraryId=lib-abc");
  });

  it("omits libraryId when scanning all", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.scanLibraries();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Library/Refresh");
  });
});
