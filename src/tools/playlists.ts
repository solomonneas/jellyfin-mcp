import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { fromPromise, toolResult, toToolHandler } from "../effect/tool-adapter.js";
import { ok, refuseUnconfirmed, DESTRUCTIVE, NON_DESTRUCTIVE, READ_ONLY } from "./_util.js";

export function registerPlaylistTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_playlists",
    "List playlists visible to a user. Use jellyfin_list_users to find an admin ID for full visibility.",
    {
      userId: z.string().describe("User ID - playlists are scoped per user"),
    },
    READ_ONLY,
    toToolHandler(({ userId }) =>
      toolResult(Effect.gen(function* () {
        const payload = yield* fromPromise(() => client.listPlaylists(userId));
        return ok({
          totalCount: payload.TotalRecordCount,
          playlists: payload.Items.map((p) => ({
            id: p.Id,
            name: p.Name,
          })),
        });
      })),
    ),
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
        .describe("Media type - required by Jellyfin if itemIds is empty"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ name, userId, itemIds, mediaType }) =>
      toolResult(Effect.gen(function* () {
        const created = yield* fromPromise(() =>
          client.createPlaylist(name, userId, itemIds, mediaType),
        );
        return ok({ id: created.Id, name: created.Name ?? name });
      })),
    ),
  );

  server.tool(
    "jellyfin_get_playlist_items",
    "List the items in a playlist, in playback order. Returns each item's playlistEntryId (use that for removal, NOT the underlying item ID).",
    {
      playlistId: z.string().describe("Playlist ID"),
      userId: z.string().describe("User ID - playlists return user-scoped views"),
    },
    READ_ONLY,
    toToolHandler(({ playlistId, userId }) =>
      toolResult(Effect.gen(function* () {
        const payload = yield* fromPromise(() => client.getPlaylistItems(playlistId, userId));
        return ok({
          totalCount: payload.TotalRecordCount,
          items: payload.Items.map((i) => ({
            playlistEntryId: (i as { PlaylistItemId?: string }).PlaylistItemId ?? null,
            itemId: i.Id,
            name: i.Name,
            type: i.Type,
            seriesName: i.SeriesName ?? null,
          })),
        });
      })),
    ),
  );

  server.tool(
    "jellyfin_add_to_playlist",
    "Append items to an existing playlist.",
    {
      playlistId: z.string().describe("Playlist ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to append"),
      userId: z.string().describe("User ID performing the add"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ playlistId, itemIds, userId }) =>
      toolResult(Effect.gen(function* () {
        yield* fromPromise(() => client.addToPlaylist(playlistId, itemIds, userId));
        return ok({ result: `added ${itemIds.length} item(s) to playlist ${playlistId}` });
      })),
    ),
  );

  server.tool(
    "jellyfin_remove_from_playlist",
    "Remove entries from a playlist by their playlistEntryId values (NOT raw item IDs - get them from jellyfin_get_playlist_items). Requires confirm: true.",
    {
      playlistId: z.string().describe("Playlist ID"),
      entryIds: z
        .array(z.string().min(1))
        .min(1)
        .describe("playlistEntryId values from jellyfin_get_playlist_items"),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true to proceed with removing entries from the playlist."),
    },
    DESTRUCTIVE,
    toToolHandler(({ playlistId, entryIds, confirm }) =>
      toolResult(Effect.gen(function* () {
        if (!confirm) {
          return refuseUnconfirmed(`remove entries from playlist ${playlistId}`);
        }
        yield* fromPromise(() => client.removeFromPlaylist(playlistId, entryIds));
        return ok({ result: `removed ${entryIds.length} entry/entries from playlist ${playlistId}` });
      })),
    ),
  );
}
