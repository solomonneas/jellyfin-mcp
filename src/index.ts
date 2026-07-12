import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Effect } from "effect";
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
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerQuickConnectTools } from "./tools/quickconnect.js";

// Single source of truth for the server name and version. Resolved at runtime
// relative to this file: both src/index.ts (dev via tsx) and dist/index.js
// (build, npm package) sit one level below the package root, and npm always
// ships package.json, so "../package.json" resolves in every mode.
const nodeRequire = createRequire(import.meta.url);
const pkg = nodeRequire("../package.json") as { name: string; version: string };

// Build and connect the MCP server over stdio. Exported so the CLI (`jellyctrl
// mcp`) and the dedicated server bin (mcp-bin.ts) share one identical startup
// path, and so the OpenClaw plugin entry that imports this module can drive it.
export function startServer(): Promise<void> {
  return Effect.runPromise(startServerEffect());
}

const startServerEffect = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* Effect.sync(() => getConfig());

    // TLS verification skipping (when JELLYFIN_VERIFY_SSL=false) is scoped to the
    // Jellyfin connection inside JellyfinClient via a per-instance undici
    // dispatcher. We deliberately do NOT set NODE_TLS_REJECT_UNAUTHORIZED, which
    // would disable certificate validation for every outbound TLS connection in
    // the process.

    const server = new McpServer({
      name: pkg.name,
      version: pkg.version,
      description:
        "MCP server for Jellyfin: control playback sessions (pause/resume/seek/volume/cast), manage users and libraries, mark watched/favorite, manage Continue Watching and resume state, manage playlists and collections, run scheduled tasks, query content, discover resume/next-up/similar items, authorize Quick Connect codes, and inspect activity logs.",
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
    registerDiscoveryTools(server, client);
    registerQuickConnectTools(server, client);

    const transport = new StdioServerTransport();
    // Strip the draft-07 `$schema` the MCP SDK stamps on tool schemas; Anthropic
    // rejects it ("must match JSON Schema draft 2020-12") when the full tool set
    // is sent, e.g. on subagent spawns. Intercept tools/list output here.
    const __send = transport.send.bind(transport);
    (transport as any).send = (message: any) => {
      const tools = message?.result?.tools;
      if (Array.isArray(tools)) {
        for (const t of tools) {
          if (t?.inputSchema) delete t.inputSchema.$schema;
          if (t?.outputSchema) delete t.outputSchema.$schema;
        }
      }
      return __send(message);
    };
    yield* Effect.promise(() => server.connect(transport));
  });

// True when this module is the process entrypoint. process.argv[1] is often a
// symlink (npm installs the bin as a link); resolve it before comparing. This
// keeps the historical `jellyfin-mcp` bin -> dist/index.js behavior: running
// the file directly starts the server, but importing it (CLI, tests, plugin
// host) does not.
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (typeof arg !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  startServer().catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`jellyfin-mcp fatal: ${msg}`);
    process.exit(1);
  });
}
