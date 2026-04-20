import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerPlaylistTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_playlists",
    "List playlists visible to a user. Use jellyfin_list_users to find an admin ID for full visibility.",
    {
      userId: z.string().describe("User ID — playlists are scoped per user"),
    },
    async ({ userId }) => {
      try {
        const result = await client.listPlaylists(userId);
        return ok({
          totalCount: result.TotalRecordCount,
          playlists: result.Items.map((p) => ({
            id: p.Id,
            name: p.Name,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_create_playlist",
    "Create a new playlist owned by a user, optionally pre-populated with items.",
    {
      name: z.string().min(1).describe("Playlist name"),
      userId: z.string().describe("Owner user ID"),
      itemIds: z
        .array(z.string().min(1))
        .optional()
        .default([])
        .describe("Optional initial item IDs"),
      mediaType: z
        .enum(["Audio", "Video", "Photo"])
        .optional()
        .describe("Media type — required by Jellyfin if itemIds is empty"),
    },
    async ({ name, userId, itemIds, mediaType }) => {
      try {
        const result = await client.createPlaylist(name, userId, itemIds, mediaType);
        return ok({ id: result.Id, name: result.Name ?? name });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_playlist_items",
    "List the items in a playlist, in playback order. Returns each item's playlistEntryId (use that for removal, NOT the underlying item ID).",
    {
      playlistId: z.string().describe("Playlist ID"),
      userId: z.string().describe("User ID — playlists return user-scoped views"),
    },
    async ({ playlistId, userId }) => {
      try {
        const result = await client.getPlaylistItems(playlistId, userId);
        return ok({
          totalCount: result.TotalRecordCount,
          items: result.Items.map((i) => ({
            playlistEntryId: (i as { PlaylistItemId?: string }).PlaylistItemId ?? null,
            itemId: i.Id,
            name: i.Name,
            type: i.Type,
            seriesName: i.SeriesName ?? null,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_add_to_playlist",
    "Append items to an existing playlist.",
    {
      playlistId: z.string().describe("Playlist ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to append"),
      userId: z.string().describe("User ID performing the add"),
    },
    async ({ playlistId, itemIds, userId }) => {
      try {
        await client.addToPlaylist(playlistId, itemIds, userId);
        return ok({ result: `added ${itemIds.length} item(s) to playlist ${playlistId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_remove_from_playlist",
    "Remove entries from a playlist by their playlistEntryId values (NOT raw item IDs — get them from jellyfin_get_playlist_items).",
    {
      playlistId: z.string().describe("Playlist ID"),
      entryIds: z
        .array(z.string().min(1))
        .min(1)
        .describe("playlistEntryId values from jellyfin_get_playlist_items"),
    },
    async ({ playlistId, entryIds }) => {
      try {
        await client.removeFromPlaylist(playlistId, entryIds);
        return ok({ result: `removed ${entryIds.length} entry/entries from playlist ${playlistId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
