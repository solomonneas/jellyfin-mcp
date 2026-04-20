import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerUserDataTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_mark_played",
    "Mark an item as watched/played for a user. Updates resume state and play count.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      itemId: z.string().describe("Item ID from a search or recent-items result"),
    },
    async ({ userId, itemId }) => {
      try {
        await client.markPlayed(userId, itemId);
        return ok({ result: `item ${itemId} marked played for user ${userId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_mark_unplayed",
    "Mark an item as unwatched/unplayed for a user.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      itemId: z.string().describe("Item ID from a search or recent-items result"),
    },
    async ({ userId, itemId }) => {
      try {
        await client.markUnplayed(userId, itemId);
        return ok({ result: `item ${itemId} marked unplayed for user ${userId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_favorite",
    "Add an item to a user's favorites.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      itemId: z.string().describe("Item ID from a search or recent-items result"),
    },
    async ({ userId, itemId }) => {
      try {
        await client.setFavorite(userId, itemId);
        return ok({ result: `item ${itemId} favorited for user ${userId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_unset_favorite",
    "Remove an item from a user's favorites.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      itemId: z.string().describe("Item ID from a search or recent-items result"),
    },
    async ({ userId, itemId }) => {
      try {
        await client.unsetFavorite(userId, itemId);
        return ok({ result: `item ${itemId} unfavorited for user ${userId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
