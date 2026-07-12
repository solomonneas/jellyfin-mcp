import { Effect } from "effect";
import { startServer } from "./index.js";

// Dedicated MCP server entrypoint. The `jellyfin-mcp` bin maps here so the
// server starts unconditionally regardless of process.argv[1] resolution
// quirks, while src/index.ts only auto-starts when run as the entrypoint.
Effect.runPromise(Effect.promise(() => startServer())).catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`jellyfin-mcp fatal: ${msg}`);
  process.exit(1);
});
