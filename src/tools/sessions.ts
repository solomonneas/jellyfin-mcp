import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

// 1 tick = 100 nanoseconds. 10_000 ticks per millisecond.
const TICKS_PER_MS = 10_000;
const ticksToSeconds = (ticks: number): number => Math.floor(ticks / TICKS_PER_MS / 1000);

export function registerSessionTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_sessions",
    "List all Jellyfin sessions (connected clients). Shows now-playing item, progress, paused state, user, device, and session ID for use with playback control tools. Set activeOnly=true to omit idle sessions.",
    {
      activeOnly: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, only return sessions with a NowPlayingItem"),
    },
    async ({ activeOnly }) => {
      try {
        const sessions = await client.listSessions();
        const filtered = activeOnly
          ? sessions.filter((s) => s.NowPlayingItem)
          : sessions;
        return ok(
          filtered.map((s) => {
            const item = s.NowPlayingItem;
            const state = s.PlayState;
            const posSec = state?.PositionTicks
              ? ticksToSeconds(state.PositionTicks)
              : 0;
            const totalSec = item?.RunTimeTicks ? ticksToSeconds(item.RunTimeTicks) : 0;
            const pct = totalSec > 0 ? Math.round((posSec / totalSec) * 100) : null;
            return {
              sessionId: s.Id,
              user: s.UserName ?? null,
              client: s.Client ?? null,
              device: s.DeviceName ?? null,
              remoteEndpoint: s.RemoteEndPoint ?? null,
              nowPlaying: item
                ? {
                    itemId: item.Id,
                    name: item.Name,
                    type: item.Type,
                    seriesName: item.SeriesName ?? null,
                    positionSec: posSec,
                    totalSec,
                    percent: pct,
                    isPaused: state?.IsPaused ?? false,
                    playMethod: state?.PlayMethod ?? null,
                  }
                : null,
            };
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_pause_session",
    "Pause playback on a specific session. Get session IDs from jellyfin_list_sessions.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
    },
    async ({ sessionId }) => {
      try {
        await client.pauseSession(sessionId);
        return ok({ result: `paused session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_resume_session",
    "Resume (unpause) playback on a specific session.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
    },
    async ({ sessionId }) => {
      try {
        await client.resumeSession(sessionId);
        return ok({ result: `resumed session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_stop_session",
    "Stop playback on a specific session (disconnects from the current item).",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
    },
    async ({ sessionId }) => {
      try {
        await client.stopSession(sessionId);
        return ok({ result: `stopped session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_send_message_to_session",
    "Send a text message to a Jellyfin client session. Shows as a toast/dialog on the user's device.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      text: z.string().min(1).describe("Message body"),
      header: z.string().optional().describe("Optional header/title for the message"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .default(5000)
        .describe("How long the message stays on screen (milliseconds)"),
    },
    async ({ sessionId, text, header, timeoutMs }) => {
      try {
        await client.sendMessage(sessionId, text, header, timeoutMs);
        return ok({ result: `message sent to session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
