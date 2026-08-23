import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Effect } from "effect";
import { getConfig } from "./config.js";
import { createMcpServer } from "./server.js";

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

    const server = createMcpServer(config);

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
