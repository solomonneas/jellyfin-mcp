import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

// 1 tick = 100 nanoseconds. Mirrors the constant in client.ts; kept local so
// this file doesn't reach into the client module for presentation math.
const TICKS_PER_SECOND = 10_000_000;
const ticksToSeconds = (ticks: number | undefined | null): number | null =>
  typeof ticks === "number" ? Math.round(ticks / TICKS_PER_SECOND) : null;

export function registerDiscoveryTools(
  server: McpServer,
  client: JellyfinClient,
): void {
  server.tool(
    "jellyfin_get_resume_items",
    "Get items a user has started but not finished (in-progress playback). Useful for 'what was I watching?' queries. Returns episodes and movies with their resume position in seconds.",
    {
      userId: z
        .string()
        .describe("User ID whose resume queue to fetch. Use jellyfin_list_users to find IDs."),
      limit: z.number().int().positive().max(100).optional().default(20),
    },
    async ({ userId, limit }) => {
      try {
        const result = await client.getResumeItems(userId, limit);
        return ok({
          totalCount: result.TotalRecordCount,
          items: result.Items.map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName ?? null,
            productionYear: item.ProductionYear ?? null,
            runtimeSeconds: ticksToSeconds(item.RunTimeTicks),
            resumePositionSeconds: ticksToSeconds(
              item.UserData?.PlaybackPositionTicks,
            ),
            playedPercentage: item.UserData?.PlayedPercentage ?? null,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_next_up",
    "Get the next unwatched episode for each series the user follows, or for a single series when seriesId is passed. Drives 'what's next on TV?' queries.",
    {
      userId: z
        .string()
        .describe("User ID to compute next-up for. Required — next-up is a per-user view."),
      seriesId: z
        .string()
        .optional()
        .describe("Optional series ID to restrict to one show. Omit for all series."),
      limit: z.number().int().positive().max(100).optional().default(20),
    },
    async ({ userId, seriesId, limit }) => {
      try {
        const result = await client.getNextUp(userId, limit, seriesId);
        return ok({
          totalCount: result.TotalRecordCount,
          items: result.Items.map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName ?? null,
            seasonNumber: item.ParentIndexNumber ?? null,
            episodeNumber: item.IndexNumber ?? null,
            productionYear: item.ProductionYear ?? null,
            runtimeSeconds: ticksToSeconds(item.RunTimeTicks),
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_similar_items",
    "Get items similar to a given item using Jellyfin's built-in recommender (genre, tags, studio overlap). Pass a userId to exclude items that user has already watched.",
    {
      itemId: z
        .string()
        .describe("Anchor item ID to find similars for (from jellyfin_search_items or similar)."),
      userId: z
        .string()
        .optional()
        .describe("Optional user context — when provided, Jellyfin filters to that user's library visibility and hydrates watched state."),
      limit: z.number().int().positive().max(100).optional().default(20),
    },
    async ({ itemId, userId, limit }) => {
      try {
        const result = await client.getSimilarItems(itemId, userId, limit);
        return ok({
          totalCount: result.TotalRecordCount,
          items: result.Items.map((item) => ({
            id: item.Id,
            name: item.Name,
            type: item.Type,
            seriesName: item.SeriesName ?? null,
            productionYear: item.ProductionYear ?? null,
            communityRating: item.CommunityRating ?? null,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
