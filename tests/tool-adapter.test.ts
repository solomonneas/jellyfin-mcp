import { describe, expect, it, vi } from "vitest";
import type { JellyfinClient } from "../src/client.js";
import { registerPlaylistTools } from "../src/tools/playlists.js";

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

describe("tool error contracts", () => {
  it("returns fail() JSON when a transform throws after a successful client call", async () => {
    const client = {
      listPlaylists: vi.fn().mockResolvedValue({ TotalRecordCount: 1 }),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerPlaylistTools(server as never, client);

    const tool = tools.get("jellyfin_list_playlists");
    const result = await tool!.handler({ userId: "u1" });

    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({
      error: expect.stringContaining("map"),
    });
  });
});
