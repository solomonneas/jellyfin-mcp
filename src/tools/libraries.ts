import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { toToolHandler } from "../effect/tool-adapter.js";
import { ok, fail, NON_DESTRUCTIVE, READ_ONLY } from "./_util.js";

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export function registerLibraryTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_libraries",
    "List all Jellyfin libraries (virtual folders) with their name, ID, collection type (movies/tvshows/music/...), and filesystem paths.",
    {},
    READ_ONLY,
    toToolHandler(() =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.listLibraries()));
        if (result._tag === "Left") return fail(result.left);
        const libs = result.right;
        return ok(
          libs.map((lib) => ({
            id: lib.ItemId,
            name: lib.Name,
            collectionType: lib.CollectionType ?? null,
            locations: lib.Locations,
          })),
        );
      }),
    ),
  );

  server.tool(
    "jellyfin_scan_library",
    "Trigger a library scan. Pass a specific library ID to scan just that one, or omit to scan all libraries. Returns immediately - the scan runs async in Jellyfin.",
    {
      libraryId: z
        .string()
        .optional()
        .describe("Library ID from jellyfin_list_libraries. Omit to scan all libraries."),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ libraryId }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.scanLibraries(libraryId)));
        if (result._tag === "Left") return fail(result.left);
        return ok({
          result: libraryId
            ? `scan triggered for library ${libraryId}`
            : "scan triggered for all libraries",
        });
      }),
    ),
  );
}
