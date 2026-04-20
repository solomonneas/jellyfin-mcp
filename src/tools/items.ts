import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

const VALID_ITEM_TYPES = [
  "Movie",
  "Series",
  "Episode",
  "Season",
  "Audio",
  "MusicAlbum",
  "MusicArtist",
  "Book",
  "Photo",
] as const;

export function registerItemTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_search_items",
    "Search the Jellyfin library for items by name. Optionally filter by type (comma-separated, e.g. 'Movie,Series').",
    {
      query: z.string().min(1).describe("Search term"),
      itemTypes: z
        .string()
        .optional()
        .describe(
          `Comma-separated item types. Valid values: ${VALID_ITEM_TYPES.join(", ")}`,
        ),
      limit: z.number().int().positive().max(200).optional().default(20),
    },
    async ({ query, itemTypes, limit }) => {
      try {
        const results = await client.searchItems(query, itemTypes, limit);
        return ok({
          totalCount: results.TotalRecordCount,
          items: results.Items.map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName ?? null,
            productionYear: item.ProductionYear ?? null,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_recent_items",
    "Get recently added items from a user's perspective (requires userId because Jellyfin's 'latest' view is per-user). Use jellyfin_list_users to find an appropriate admin user ID.",
    {
      userId: z
        .string()
        .describe("User ID to compute 'latest' for (Jellyfin requires this). Use an admin ID to see everything."),
      limit: z.number().int().positive().max(100).optional().default(20),
    },
    async ({ userId, limit }) => {
      try {
        const items = await client.getRecentItems(userId, limit);
        return ok(
          items.map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName ?? null,
            productionYear: item.ProductionYear ?? null,
            dateCreated: item.DateCreated ?? null,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_item",
    "Get full metadata for a single item by ID. Returns the raw Jellyfin Item object — use this for deep inspection after narrowing via search.",
    {
      itemId: z.string().describe("Item ID from a search or recent-items result"),
    },
    async ({ itemId }) => {
      try {
        const item = await client.getItem(itemId);
        return ok(item);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
