import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerCollectionTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_create_collection",
    "Create a new collection (BoxSet), optionally pre-populated with items. Collections are server-wide, not per-user.",
    {
      name: z.string().min(1).describe("Collection name"),
      itemIds: z
        .array(z.string().min(1))
        .optional()
        .default([])
        .describe("Optional initial item IDs"),
    },
    async ({ name, itemIds }) => {
      try {
        const result = await client.createCollection(name, itemIds);
        return ok({ id: result.Id, name });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_add_to_collection",
    "Add items to an existing collection.",
    {
      collectionId: z.string().describe("Collection ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to add"),
    },
    async ({ collectionId, itemIds }) => {
      try {
        await client.addToCollection(collectionId, itemIds);
        return ok({ result: `added ${itemIds.length} item(s) to collection ${collectionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_remove_from_collection",
    "Remove items from a collection.",
    {
      collectionId: z.string().describe("Collection ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to remove"),
    },
    async ({ collectionId, itemIds }) => {
      try {
        await client.removeFromCollection(collectionId, itemIds);
        return ok({
          result: `removed ${itemIds.length} item(s) from collection ${collectionId}`,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
