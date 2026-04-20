import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { JellyfinClient } from "./client.js";
import { registerSystemTools } from "./tools/system.js";
import { registerLibraryTools } from "./tools/libraries.js";
import { registerUserTools } from "./tools/users.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerItemTools } from "./tools/items.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerUserDataTools } from "./tools/userdata.js";
import { registerPlaylistTools } from "./tools/playlists.js";
import { registerCollectionTools } from "./tools/collections.js";

async function main(): Promise<void> {
  const config = getConfig();

  if (!config.verifySsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const server = new McpServer({
    name: "jellyfin-mcp",
    version: "0.2.0",
    description:
      "MCP server for Jellyfin — control playback sessions (pause/resume/seek/volume/cast), manage users and libraries, mark watched/favorite, manage playlists and collections, run scheduled tasks, query content, and inspect activity logs.",
  });

  const client = new JellyfinClient(config);

  registerSystemTools(server, client);
  registerLibraryTools(server, client);
  registerUserTools(server, client);
  registerSessionTools(server, client);
  registerItemTools(server, client);
  registerTaskTools(server, client);
  registerUserDataTools(server, client);
  registerPlaylistTools(server, client);
  registerCollectionTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`jellyfin-mcp fatal: ${msg}`);
  process.exit(1);
});
