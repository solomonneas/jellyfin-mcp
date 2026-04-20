import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

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
    "Restart the Jellyfin server process. Use only when necessary — active playback sessions will disconnect.",
    {},
    async () => {
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
    "Shut down the Jellyfin server. Users will need to start it manually (or via OS service) to bring it back.",
    {},
    async () => {
      try {
        await client.shutdown();
        return ok({ result: "shutdown signal sent" });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
