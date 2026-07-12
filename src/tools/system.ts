import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { toToolHandler } from "../effect/tool-adapter.js";
import { ok, fail, refuseUnconfirmed, DESTRUCTIVE, READ_ONLY } from "./_util.js";

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export function registerSystemTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_get_status",
    "Get Jellyfin server info: name, version, OS, architecture, local address, pending restart, update availability.",
    {},
    READ_ONLY,
    toToolHandler(() =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.getSystemInfo()));
        if (result._tag === "Left") return fail(result.left);
        const info = result.right;
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
      }),
    ),
  );

  server.tool(
    "jellyfin_restart_server",
    "Restart the Jellyfin server process. Destructive: active playback sessions disconnect. Requires confirm: true.",
    {
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true. Required acknowledgement that active sessions will disconnect."),
    },
    DESTRUCTIVE,
    toToolHandler(({ confirm }) =>
      Effect.gen(function* () {
        if (!confirm) return refuseUnconfirmed("restart the Jellyfin server");
        const result = yield* Effect.either(fromPromise(() => client.restart()));
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: "restart signal sent" });
      }),
    ),
  );

  server.tool(
    "jellyfin_shutdown_server",
    "Shut down the Jellyfin server. Destructive: server stays down until something restarts it manually. Requires confirm: true.",
    {
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true. Required acknowledgement that the server will not come back on its own."),
    },
    DESTRUCTIVE,
    toToolHandler(({ confirm }) =>
      Effect.gen(function* () {
        if (!confirm) return refuseUnconfirmed("shut down the Jellyfin server");
        const result = yield* Effect.either(fromPromise(() => client.shutdown()));
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: "shutdown signal sent" });
      }),
    ),
  );
}
