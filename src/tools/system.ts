import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail, refuseUnconfirmed } from "./_util.js";

export function registerSystemTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_get_status",
    "Get Jellyfin server info: name, version, OS, architecture, local address, pending restart, update availability.",
    {},
    async () => {
      try {
        const info = await client.getSystemInfo();
        return ok({
          serverName: info.ServerName,
          version: info.Version,
          id: info.Id,
          os: info.OperatingSystemDisplayName ?? null,
          architecture: info.SystemArchitecture ?? null,
          localAddress: info.LocalAddress ?? null,
          hasPendingRestart: info.HasPendingRestart ?? false,
          hasUpdateAvailable: info.HasUpdateAvailable ?? false,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_restart_server",
    "Restart the Jellyfin server process. Destructive: active playback sessions disconnect. Requires confirm: true.",
    {
      confirm: z
        .literal(true)
        .describe("Must be true. Required acknowledgement that active sessions will disconnect."),
    },
    async ({ confirm }) => {
      if (!confirm) return refuseUnconfirmed("restart the Jellyfin server");
      try {
        await client.restart();
        return ok({ result: "restart signal sent" });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_shutdown_server",
    "Shut down the Jellyfin server. Destructive: server stays down until something restarts it manually. Requires confirm: true.",
    {
      confirm: z
        .literal(true)
        .describe("Must be true. Required acknowledgement that the server will not come back on its own."),
    },
    async ({ confirm }) => {
      if (!confirm) return refuseUnconfirmed("shut down the Jellyfin server");
      try {
        await client.shutdown();
        return ok({ result: "shutdown signal sent" });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
