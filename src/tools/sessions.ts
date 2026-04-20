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

  server.tool(
    "jellyfin_seek_session",
    "Seek the active item on a session to a specific position in seconds.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      positionSec: z.number().nonnegative().describe("Target position in seconds from start"),
    },
    async ({ sessionId, positionSec }) => {
      try {
        await client.seekSession(sessionId, positionSec);
        return ok({ result: `seeked session ${sessionId} to ${positionSec}s` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_next_track",
    "Advance to the next track/episode in the session's queue.",
    { sessionId: z.string().describe("Session ID from jellyfin_list_sessions") },
    async ({ sessionId }) => {
      try {
        await client.nextTrack(sessionId);
        return ok({ result: `next track on session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_previous_track",
    "Go back to the previous track/episode in the session's queue.",
    { sessionId: z.string().describe("Session ID from jellyfin_list_sessions") },
    async ({ sessionId }) => {
      try {
        await client.previousTrack(sessionId);
        return ok({ result: `previous track on session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_volume",
    "Set the playback volume on a session (0–100). Note: only supported by clients that implement the SetVolume general command (most web/desktop/mobile, not all DLNA).",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      volume: z.number().int().min(0).max(100).describe("Volume level 0–100"),
    },
    async ({ sessionId, volume }) => {
      try {
        await client.sendVolume(sessionId, volume);
        return ok({ result: `volume on session ${sessionId} set to ${volume}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_mute",
    "Mute, unmute, or toggle mute on a session.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      action: z.enum(["mute", "unmute", "toggle"]).describe("Mute action to send"),
    },
    async ({ sessionId, action }) => {
      try {
        const cmd = action === "mute" ? "Mute" : action === "unmute" ? "Unmute" : "ToggleMute";
        await client.sendMuteCommand(sessionId, cmd);
        return ok({ result: `${action} sent to session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_audio_stream",
    "Switch the active audio track on a session by stream index. Get valid indices from the item's MediaStreams.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      index: z.number().int().min(0).describe("Audio stream index"),
    },
    async ({ sessionId, index }) => {
      try {
        await client.setAudioStream(sessionId, index);
        return ok({ result: `audio stream set to index ${index} on session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_subtitle_stream",
    "Switch the active subtitle track on a session by stream index. Use -1 to disable subtitles.",
    {
      sessionId: z.string().describe("Session ID from jellyfin_list_sessions"),
      index: z.number().int().min(-1).describe("Subtitle stream index (-1 to disable)"),
    },
    async ({ sessionId, index }) => {
      try {
        await client.setSubtitleStream(sessionId, index);
        return ok({ result: `subtitle stream set to index ${index} on session ${sessionId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_play_on_session",
    "Tell a session to play one or more items (cast/remote-play). Use playCommand=PlayNow to start immediately, PlayNext to queue after current, or PlayLast to queue at the end.",
    {
      sessionId: z.string().describe("Target session from jellyfin_list_sessions"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to play (in order)"),
      playCommand: z
        .enum(["PlayNow", "PlayNext", "PlayLast"])
        .optional()
        .default("PlayNow"),
      startPositionSec: z
        .number()
        .nonnegative()
        .optional()
        .describe("Optional start offset in seconds (only meaningful with PlayNow)"),
    },
    async ({ sessionId, itemIds, playCommand, startPositionSec }) => {
      try {
        await client.playOnSession(sessionId, itemIds, playCommand, startPositionSec);
        return ok({
          result: `${playCommand} ${itemIds.length} item(s) on session ${sessionId}`,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
