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

  it("converts seek seconds to ticks (10M ticks/sec)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.seekSession("s1", 120);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Sessions/s1/Playing/Seek?seekPositionTicks=1200000000");
  });

  it("sends SetVolume as a stringified integer in Arguments", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.sendVolume("s1", 42);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Sessions/s1/Command");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ Name: "SetVolume", Arguments: { Volume: "42" } });
  });

  it("playOnSession joins itemIds and defaults playCommand to PlayNow", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.playOnSession("s1", ["a", "b", "c"]);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Sessions/s1/Playing");
    expect(parsed.searchParams.get("itemIds")).toBe("a,b,c");
    expect(parsed.searchParams.get("playCommand")).toBe("PlayNow");
    expect(parsed.searchParams.get("startPositionTicks")).toBeNull();
  });

  it("playOnSession converts startPositionSec to ticks", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.playOnSession("s1", ["a"], "PlayNow", 5);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("startPositionTicks")).toBe("50000000");
  });

  it("markPlayed POSTs the user/item path", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.markPlayed("u1", "i1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Users/u1/PlayedItems/i1");
    expect(opts.method).toBe("POST");
  });

  it("unsetFavorite DELETEs the user/item favorite path", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.unsetFavorite("u1", "i1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Users/u1/FavoriteItems/i1");
    expect(opts.method).toBe("DELETE");
  });

  it("createPlaylist POSTs JSON body with Name/UserId/Ids", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Id: "pl1", Name: "Mix" }), { status: 200 }),
    );
    const result = await client.createPlaylist("Mix", "u1", ["a", "b"]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Playlists");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ Name: "Mix", UserId: "u1", Ids: ["a", "b"] });
    expect(result.Id).toBe("pl1");
  });

  it("createPlaylist includes MediaType when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Id: "pl1" }), { status: 200 }),
    );
    await client.createPlaylist("Empty", "u1", [], "Audio");
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.MediaType).toBe("Audio");
  });

  it("removeFromPlaylist passes EntryIds (not item IDs)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.removeFromPlaylist("pl1", ["entry-1", "entry-2"]);
    const [url, opts] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Playlists/pl1/Items");
    expect(parsed.searchParams.get("EntryIds")).toBe("entry-1,entry-2");
    expect(opts.method).toBe("DELETE");
  });

  it("setAudioStream goes through /Command (general command, not playstate)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.setAudioStream("s1", 2);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Sessions/s1/Command");
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ Name: "SetAudioStreamIndex", Arguments: { Index: "2" } });
  });

  it("setSubtitleStream supports -1 to disable subtitles", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.setSubtitleStream("s1", -1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/Sessions/s1/Command");
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ Name: "SetSubtitleStreamIndex", Arguments: { Index: "-1" } });
  });

  it("createCollection omits Ids when empty", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Id: "c1" }), { status: 200 }),
    );
    await client.createCollection("Best of");
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Collections");
    expect(parsed.searchParams.get("Name")).toBe("Best of");
    expect(parsed.searchParams.get("Ids")).toBeNull();
  });

  it("getResumeItems hits per-user Resume path", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ Items: [{ Id: "i1", Name: "Ep", Type: "Episode" }], TotalRecordCount: 1 }),
        { status: 200 },
      ),
    );
    const result = await client.getResumeItems("user-42", 10);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Users/user-42/Items/Resume");
    expect(parsed.searchParams.get("Limit")).toBe("10");
    expect(result.Items[0].Id).toBe("i1");
  });

  it("getResumeItems URL-encodes the userId into the path", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), { status: 200 }),
    );
    await client.getResumeItems("user/with space", 5);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Users/user%2Fwith%20space/Items/Resume");
  });

  it("getNextUp sends userId as a query param (not a path segment)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), { status: 200 }),
    );
    await client.getNextUp("user-42", 5);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Shows/NextUp");
    expect(parsed.searchParams.get("userId")).toBe("user-42");
    expect(parsed.searchParams.get("Limit")).toBe("5");
    expect(parsed.searchParams.get("seriesId")).toBeNull();
  });

  it("getNextUp includes seriesId when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), { status: 200 }),
    );
    await client.getNextUp("user-42", 5, "series-abc");
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("seriesId")).toBe("series-abc");
  });

  it("getSimilarItems URL-encodes the itemId and omits userId when absent", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), { status: 200 }),
    );
    await client.getSimilarItems("item/with space", undefined, 15);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/Items/item%2Fwith%20space/Similar");
    expect(parsed.searchParams.get("Limit")).toBe("15");
    expect(parsed.searchParams.get("userId")).toBeNull();
  });

  it("getSimilarItems includes userId when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), { status: 200 }),
    );
    await client.getSimilarItems("item1", "user-42");
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("userId")).toBe("user-42");
  });

  it("getQuickConnectEnabled parses a boolean body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("true", { status: 200 }));
    await expect(client.getQuickConnectEnabled()).resolves.toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jellyfin.test/QuickConnect/Enabled");
  });

  it("authorizeQuickConnect POSTs code + userId as query params", async () => {
    fetchMock.mockResolvedValueOnce(new Response("true", { status: 200 }));
    await client.authorizeQuickConnect("ABC123", "user-42");
    const [url, opts] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/QuickConnect/Authorize");
    expect(parsed.searchParams.get("code")).toBe("ABC123");
    expect(parsed.searchParams.get("userId")).toBe("user-42");
    expect(opts.method).toBe("POST");
  });

  it("authorizeQuickConnect URL-encodes code and userId (reserved chars)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("true", { status: 200 }));
    // URLSearchParams encodes with + for spaces; verify the server sees the
    // original values via .get() rather than string-matching the raw URL.
    await client.authorizeQuickConnect("A B&C=D", "user/42?x");
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("code")).toBe("A B&C=D");
    expect(parsed.searchParams.get("userId")).toBe("user/42?x");
  });
});
