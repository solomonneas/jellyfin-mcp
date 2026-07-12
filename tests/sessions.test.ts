import { describe, it, expect, vi } from "vitest";
import { registerSessionTools } from "../src/tools/sessions.js";
import type { JellyfinClient } from "../src/client.js";

interface CapturedTool {
  name: string;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean };
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}

function makeFakeServer(): { server: unknown; tools: Map<string, CapturedTool> } {
  const tools = new Map<string, CapturedTool>();
  const server = {
    tool: (
      name: string,
      _description: string,
      _schema: unknown,
      annotations: CapturedTool["annotations"],
      handler: CapturedTool["handler"],
    ) => {
      tools.set(name, { name, annotations, handler });
    },
  };
  return { server, tools };
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("jellyfin_stop_session", () => {
  it("refuses without confirm", async () => {
    const client = {
      stopSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_stop_session");
    const result = await tool!.handler({ sessionId: "s1" });

    expect(result.isError).toBe(true);
    expect(client.stopSession).not.toHaveBeenCalled();
    expect(parseResult(result)).toMatchObject({ error: expect.stringContaining("confirm") });
  });

  it("executes with confirm true", async () => {
    const client = {
      stopSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_stop_session");
    const result = await tool!.handler({ sessionId: "s1", confirm: true });

    expect(result.isError).toBeUndefined();
    expect(client.stopSession).toHaveBeenCalledWith("s1");
    expect(parseResult(result)).toEqual({ result: "stopped session s1" });
  });
});

describe("multi-session tools", () => {
  it("pause all refuses without confirm", async () => {
    const client = {
      listSessions: vi.fn(),
      pauseSession: vi.fn(),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_pause_all_sessions");
    const result = await tool!.handler({});

    expect(result.isError).toBe(true);
    expect(client.listSessions).not.toHaveBeenCalled();
    expect(client.pauseSession).not.toHaveBeenCalled();
  });

  it("pauses only matching active sessions for a user", async () => {
    const client = {
      listSessions: vi.fn().mockResolvedValue([
        {
          Id: "s1",
          UserId: "u1",
          UserName: "User",
          NowPlayingItem: { Id: "i1", Name: "Movie", Type: "Movie" },
        },
        { Id: "s2", UserId: "u1", UserName: "User" },
        {
          Id: "s3",
          UserId: "u2",
          UserName: "Other",
          NowPlayingItem: { Id: "i2", Name: "Other Movie", Type: "Movie" },
        },
      ]),
      pauseSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_pause_all_sessions");
    const result = await tool!.handler({
      userId: "u1",
      activeOnly: true,
      confirm: true,
    });

    expect(client.pauseSession).toHaveBeenCalledTimes(1);
    expect(client.pauseSession).toHaveBeenCalledWith("s1");
    expect(parseResult(result)).toMatchObject({
      action: "pause",
      targetedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    });
  });

  it("reports partial failures when stopping sessions", async () => {
    const client = {
      listSessions: vi.fn().mockResolvedValue([
        { Id: "s1", NowPlayingItem: { Id: "i1", Name: "Movie 1", Type: "Movie" } },
        { Id: "s2", NowPlayingItem: { Id: "i2", Name: "Movie 2", Type: "Movie" } },
      ]),
      stopSession: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("cannot stop")),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_stop_all_sessions");
    const result = await tool!.handler({ confirm: true });

    expect(result.isError).toBeUndefined();
    expect(parseResult(result)).toMatchObject({
      action: "stop",
      partialFailure: true,
      targetedCount: 2,
      succeededCount: 1,
      failedCount: 1,
    });
    expect(parseResult(result).failedSessions).toEqual([
      expect.objectContaining({ sessionId: "s2", error: "cannot stop" }),
    ]);
  });

  it("messages all active sessions", async () => {
    const client = {
      listSessions: vi.fn().mockResolvedValue([
        { Id: "s1", NowPlayingItem: { Id: "i1", Name: "Movie", Type: "Movie" } },
        { Id: "s2" },
      ]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerSessionTools(server as never, client);

    const tool = tools.get("jellyfin_message_all_active_sessions");
    const result = await tool!.handler({
      text: "Dinner",
      header: "Message",
      timeoutMs: 1000,
      confirm: true,
    });

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith("s1", "Dinner", "Message", 1000);
    expect(parseResult(result)).toMatchObject({
      action: "message",
      targetedCount: 1,
      succeededCount: 1,
    });
  });
});
