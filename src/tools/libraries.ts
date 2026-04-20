import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerLibraryTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_libraries",
    "List all Jellyfin libraries (virtual folders) with their name, ID, collection type (movies/tvshows/music/...), and filesystem paths.",
    {},
    async () => {
      try {
        const libs = await client.listLibraries();
        return ok(
          libs.map((lib) => ({
            id: lib.ItemId,
            name: lib.Name,
            collectionType: lib.CollectionType ?? null,
            locations: lib.Locations,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_scan_library",
    "Trigger a library scan. Pass a specific library ID to scan just that one, or omit to scan all libraries. Returns immediately — the scan runs async in Jellyfin.",
    {
      libraryId: z
        .string()
        .optional()
        .describe("Library ID from jellyfin_list_libraries. Omit to scan all libraries."),
    },
    async ({ libraryId }) => {
      try {
        await client.scanLibraries(libraryId);
        return ok({
          result: libraryId
            ? `scan triggered for library ${libraryId}`
            : "scan triggered for all libraries",
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
