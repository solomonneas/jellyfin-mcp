import { describe, it, expect, vi } from "vitest";
import { registerQuickConnectTools } from "../src/tools/quickconnect.js";
import type { JellyfinClient } from "../src/client.js";

// Minimal McpServer double: registerQuickConnectTools only uses server.tool(),
// so we capture registrations into a map and invoke them directly. Avoids
// standing up the real MCP transport just to exercise a handler function.
interface CapturedTool {
  name: string;
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
      handler: CapturedTool["handler"],
    ) => {
      tools.set(name, { name, handler });
    },
  };
  return { server, tools };
}

describe("jellyfin_quick_connect_authorize confirm gate", () => {
  it("refuses without confirm and does not call the client", async () => {
    const client = {
      authorizeQuickConnect: vi.fn(),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerQuickConnectTools(server as never, client);

    const tool = tools.get("jellyfin_quick_connect_authorize");
    expect(tool).toBeDefined();

    const result = await tool!.handler({ code: "ABC123", userId: "user-42" });

    expect(result.isError).toBe(true);
    expect((client.authorizeQuickConnect as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    // Refusal message must identify the user (operator context) but must NOT
    // echo the short-lived auth code.
    expect(result.content[0].text).toContain("user-42");
    expect(result.content[0].text).not.toContain("ABC123");
  });

  it("calls the client when confirm is true and does not echo the code back", async () => {
    const client = {
      authorizeQuickConnect: vi.fn().mockResolvedValue(true),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerQuickConnectTools(server as never, client);

    const tool = tools.get("jellyfin_quick_connect_authorize");
    const result = await tool!.handler({
      code: "ABC123",
      userId: "user-42",
      confirm: true,
    });

    expect(result.isError).toBeUndefined();
    expect(client.authorizeQuickConnect).toHaveBeenCalledWith("ABC123", "user-42");
    expect(result.content[0].text).toContain("user-42");
    expect(result.content[0].text).toContain("authorized");
    expect(result.content[0].text).not.toContain("ABC123");
  });

  it("surfaces client errors via fail()", async () => {
    const client = {
      authorizeQuickConnect: vi.fn().mockRejectedValue(new Error("HTTP 404")),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerQuickConnectTools(server as never, client);

    const tool = tools.get("jellyfin_quick_connect_authorize");
    const result = await tool!.handler({
      code: "ABC123",
      userId: "user-42",
      confirm: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 404");
  });

  it("status tool returns the enabled flag", async () => {
    const client = {
      getQuickConnectEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as JellyfinClient;
    const { server, tools } = makeFakeServer();
    registerQuickConnectTools(server as never, client);

    const tool = tools.get("jellyfin_quick_connect_status");
    const result = await tool!.handler({});

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ enabled: true });
  });
});
