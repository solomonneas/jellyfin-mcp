import type { JellyfinConfig } from "./config.js";
import type {
  SystemInfo,
  Library,
  User,
  Session,
  Item,
  ItemsResponse,
  ActivityLogResponse,
  ScheduledTask,
  Playlist,
  PlayCommand,
} from "./types.js";

// 1 tick = 100 nanoseconds. Centralized so callers pass seconds and we convert
// once at the boundary instead of leaking ticks into tool argument schemas.
const TICKS_PER_SECOND = 10_000_000;
export const secondsToTicks = (seconds: number): number =>
  Math.floor(seconds * TICKS_PER_SECOND);

export class JellyfinClient {
  private baseUrl: string;
  private timeout: number;

  constructor(private config: JellyfinConfig) {
    this.baseUrl = config.url;
    this.timeout = config.timeout;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    parseJson = true,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Jellyfin accepts the token in either X-Emby-Token or X-MediaBrowser-Token.
    // X-Emby-Token is the canonical modern one.
    const headers: Record<string, string> = {
      "X-Emby-Token": this.config.apiKey,
      Accept: "application/json",
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const messages: Record<number, string> = {
          401: "Invalid API key or unauthorized access",
          403: "Forbidden — API key lacks permission for this operation",
          404: `Resource not found: ${path}`,
          500: "Jellyfin server error",
        };
        const msg = messages[response.status] ?? `HTTP ${response.status}`;
        throw new Error(`${msg}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }

      if (!parseJson) {
        return undefined as T;
      }

      // Some POST endpoints (e.g. /Sessions/{id}/Playing/Pause) return 204 No Content.
      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request to ${path} timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── System ────────────────────────────────────────────────────────────────
  async getSystemInfo(): Promise<SystemInfo> {
    return this.request<SystemInfo>("/System/Info");
  }

  async restart(): Promise<void> {
    await this.request("/System/Restart", { method: "POST" }, false);
  }

  async shutdown(): Promise<void> {
    await this.request("/System/Shutdown", { method: "POST" }, false);
  }

  // ── Libraries ─────────────────────────────────────────────────────────────
  async listLibraries(): Promise<Library[]> {
    return this.request<Library[]>("/Library/VirtualFolders");
  }

  async scanLibraries(libraryId?: string): Promise<void> {
    const path = libraryId
      ? `/Library/Refresh?libraryId=${encodeURIComponent(libraryId)}`
      : "/Library/Refresh";
    await this.request(path, { method: "POST" }, false);
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async listUsers(): Promise<User[]> {
    return this.request<User[]>("/Users");
  }

  async createUser(name: string): Promise<User> {
    return this.request<User>("/Users/New", {
      method: "POST",
      body: JSON.stringify({ Name: name }),
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/Users/${encodeURIComponent(userId)}`, { method: "DELETE" }, false);
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/Policy`,
      {
        method: "POST",
        body: JSON.stringify({ IsDisabled: disabled }),
      },
      false,
    );
  }

  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/Password`,
      {
        method: "POST",
        body: JSON.stringify({ NewPw: newPassword, ResetPassword: false }),
      },
      false,
    );
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async listSessions(): Promise<Session[]> {
    return this.request<Session[]>("/Sessions");
  }

  async pauseSession(sessionId: string): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/Pause`,
      { method: "POST" },
      false,
    );
  }

  async resumeSession(sessionId: string): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/Unpause`,
      { method: "POST" },
      false,
    );
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop`,
      { method: "POST" },
      false,
    );
  }

  async sendMessage(sessionId: string, text: string, header?: string, timeoutMs = 5000): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Message`,
      {
        method: "POST",
        body: JSON.stringify({
          Text: text,
          Header: header ?? "Message",
          TimeoutMs: timeoutMs,
        }),
      },
      false,
    );
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  async searchItems(
    query: string,
    itemTypes?: string,
    limit = 20,
  ): Promise<ItemsResponse> {
    const params = new URLSearchParams({
      searchTerm: query,
      Recursive: "true",
      Limit: String(limit),
    });
    if (itemTypes) {
      params.set("IncludeItemTypes", itemTypes);
    }
    return this.request<ItemsResponse>(`/Items?${params.toString()}`);
  }

  async getRecentItems(userId: string, limit = 20): Promise<Item[]> {
    const params = new URLSearchParams({
      UserId: userId,
      Limit: String(limit),
      Fields: "DateCreated,SeriesName,ProductionYear",
    });
    return this.request<Item[]>(`/Items/Latest?${params.toString()}`);
  }

  async getItem(itemId: string): Promise<Item> {
    return this.request<Item>(`/Items/${encodeURIComponent(itemId)}`);
  }

  // ── Discovery (Resume / NextUp / Similar) ─────────────────────────────────
  // Resume is per-user: Jellyfin tracks playback position on the user row, not
  // the item row. Episodes and movies with PlaybackPositionTicks > 0 show up.
  async getResumeItems(userId: string, limit = 20): Promise<ItemsResponse> {
    const params = new URLSearchParams({
      Limit: String(limit),
      Fields: "SeriesName,ProductionYear,UserData",
    });
    return this.request<ItemsResponse>(
      `/Users/${encodeURIComponent(userId)}/Items/Resume?${params.toString()}`,
    );
  }

  // NextUp returns the next unwatched episode per-series, filtered to one user.
  // seriesId is optional — omit to get next-up across all series.
  async getNextUp(userId: string, limit = 20, seriesId?: string): Promise<ItemsResponse> {
    const params = new URLSearchParams({
      userId,
      Limit: String(limit),
      Fields: "SeriesName,ProductionYear,UserData",
    });
    if (seriesId) params.set("seriesId", seriesId);
    return this.request<ItemsResponse>(`/Shows/NextUp?${params.toString()}`);
  }

  // Similar uses Jellyfin's built-in recommender (genre/tag/studio overlap).
  // userId is optional but recommended — it lets Jellyfin exclude already-watched
  // items and hydrate UserData on the response.
  async getSimilarItems(itemId: string, userId?: string, limit = 20): Promise<ItemsResponse> {
    const params = new URLSearchParams({ Limit: String(limit) });
    if (userId) params.set("userId", userId);
    return this.request<ItemsResponse>(
      `/Items/${encodeURIComponent(itemId)}/Similar?${params.toString()}`,
    );
  }

  // ── Quick Connect ─────────────────────────────────────────────────────────
  // Quick Connect lets a user log in on a new client by typing a 6-character
  // code into an already-authenticated client. Flow:
  //   1. New client calls POST /QuickConnect/Initiate → gets a code + secret
  //   2. User reads the code out loud / types it into an admin client
  //   3. Admin calls POST /QuickConnect/Authorize?code=XXXXXX&userId=<user-id>
  //   4. New client polls GET /QuickConnect/Connect?secret=... until authorized,
  //      then trades the secret for an access token.
  // The MCP exposes steps 1 and 3: status (is QC enabled), authorize (admin
  // approves a pending code for a given user). Listing pending codes isn't an
  // endpoint — codes are known only to the user who initiated.
  async getQuickConnectEnabled(): Promise<boolean> {
    return this.request<boolean>("/QuickConnect/Enabled");
  }

  async authorizeQuickConnect(code: string, userId: string): Promise<boolean> {
    const params = new URLSearchParams({ code, userId });
    return this.request<boolean>(
      `/QuickConnect/Authorize?${params.toString()}`,
      { method: "POST" },
    );
  }

  // ── Activity & Tasks ──────────────────────────────────────────────────────
  async getActivityLog(limit = 20, minDate?: string): Promise<ActivityLogResponse> {
    const params = new URLSearchParams({ Limit: String(limit) });
    if (minDate) params.set("minDate", minDate);
    return this.request<ActivityLogResponse>(`/System/ActivityLog/Entries?${params.toString()}`);
  }

  async listScheduledTasks(): Promise<ScheduledTask[]> {
    return this.request<ScheduledTask[]>("/ScheduledTasks");
  }

  async runScheduledTask(taskId: string): Promise<void> {
    await this.request(
      `/ScheduledTasks/Running/${encodeURIComponent(taskId)}`,
      { method: "POST" },
      false,
    );
  }

  // ── Playback (deeper) ─────────────────────────────────────────────────────
  async seekSession(sessionId: string, positionSec: number): Promise<void> {
    const ticks = secondsToTicks(positionSec);
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/Seek?seekPositionTicks=${ticks}`,
      { method: "POST" },
      false,
    );
  }

  async nextTrack(sessionId: string): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/NextTrack`,
      { method: "POST" },
      false,
    );
  }

  async previousTrack(sessionId: string): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/PreviousTrack`,
      { method: "POST" },
      false,
    );
  }

  // SetAudioStreamIndex / SetSubtitleStreamIndex are GeneralCommandType values,
  // not playstate commands — they go through /Sessions/{id}/Command with the
  // index passed via Arguments.Index (stringified, per Jellyfin's command DTO).
  async setAudioStream(sessionId: string, index: number): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Command`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: "SetAudioStreamIndex",
          Arguments: { Index: String(index) },
        }),
      },
      false,
    );
  }

  async setSubtitleStream(sessionId: string, index: number): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Command`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: "SetSubtitleStreamIndex",
          Arguments: { Index: String(index) },
        }),
      },
      false,
    );
  }

  // /Sessions/{id}/Command takes a generic command envelope. Volume goes
  // 0–100 as a string in Arguments.Volume.
  async sendVolume(sessionId: string, volume: number): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Command`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: "SetVolume",
          Arguments: { Volume: String(volume) },
        }),
      },
      false,
    );
  }

  async sendMuteCommand(sessionId: string, action: "Mute" | "Unmute" | "ToggleMute"): Promise<void> {
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Command`,
      {
        method: "POST",
        body: JSON.stringify({ Name: action }),
      },
      false,
    );
  }

  // Cast/remote-play: tell a session to play one or more items.
  async playOnSession(
    sessionId: string,
    itemIds: string[],
    playCommand: PlayCommand = "PlayNow",
    startPositionSec?: number,
  ): Promise<void> {
    const params = new URLSearchParams({
      playCommand,
      itemIds: itemIds.join(","),
    });
    if (startPositionSec !== undefined) {
      params.set("startPositionTicks", String(secondsToTicks(startPositionSec)));
    }
    await this.request(
      `/Sessions/${encodeURIComponent(sessionId)}/Playing?${params.toString()}`,
      { method: "POST" },
      false,
    );
  }

  // ── User data (watched / favorite) ────────────────────────────────────────
  async markPlayed(userId: string, itemId: string): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/PlayedItems/${encodeURIComponent(itemId)}`,
      { method: "POST" },
      false,
    );
  }

  async markUnplayed(userId: string, itemId: string): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/PlayedItems/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
      false,
    );
  }

  async setFavorite(userId: string, itemId: string): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/FavoriteItems/${encodeURIComponent(itemId)}`,
      { method: "POST" },
      false,
    );
  }

  async unsetFavorite(userId: string, itemId: string): Promise<void> {
    await this.request(
      `/Users/${encodeURIComponent(userId)}/FavoriteItems/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
      false,
    );
  }

  // ── Playlists ─────────────────────────────────────────────────────────────
  async listPlaylists(userId: string): Promise<ItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      Recursive: "true",
      IncludeItemTypes: "Playlist",
    });
    return this.request<ItemsResponse>(`/Items?${params.toString()}`);
  }

  async createPlaylist(
    name: string,
    userId: string,
    itemIds: string[] = [],
    mediaType?: string,
  ): Promise<Playlist> {
    return this.request<Playlist>("/Playlists", {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        UserId: userId,
        Ids: itemIds,
        ...(mediaType ? { MediaType: mediaType } : {}),
      }),
    });
  }

  async getPlaylistItems(playlistId: string, userId: string): Promise<ItemsResponse> {
    const params = new URLSearchParams({ UserId: userId });
    return this.request<ItemsResponse>(
      `/Playlists/${encodeURIComponent(playlistId)}/Items?${params.toString()}`,
    );
  }

  async addToPlaylist(playlistId: string, itemIds: string[], userId: string): Promise<void> {
    const params = new URLSearchParams({
      Ids: itemIds.join(","),
      UserId: userId,
    });
    await this.request(
      `/Playlists/${encodeURIComponent(playlistId)}/Items?${params.toString()}`,
      { method: "POST" },
      false,
    );
  }

  // EntryIds here are the per-row playlist entry IDs (NOT the underlying item
  // IDs). Get them from the PlaylistItemId field returned by getPlaylistItems.
  async removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void> {
    const params = new URLSearchParams({ EntryIds: entryIds.join(",") });
    await this.request(
      `/Playlists/${encodeURIComponent(playlistId)}/Items?${params.toString()}`,
      { method: "DELETE" },
      false,
    );
  }

  // ── Collections ───────────────────────────────────────────────────────────
  async createCollection(name: string, itemIds: string[] = []): Promise<{ Id: string }> {
    const params = new URLSearchParams({ Name: name });
    if (itemIds.length > 0) {
      params.set("Ids", itemIds.join(","));
    }
    return this.request<{ Id: string }>(`/Collections?${params.toString()}`, {
      method: "POST",
    });
  }

  async addToCollection(collectionId: string, itemIds: string[]): Promise<void> {
    const params = new URLSearchParams({ Ids: itemIds.join(",") });
    await this.request(
      `/Collections/${encodeURIComponent(collectionId)}/Items?${params.toString()}`,
      { method: "POST" },
      false,
    );
  }

  async removeFromCollection(collectionId: string, itemIds: string[]): Promise<void> {
    const params = new URLSearchParams({ Ids: itemIds.join(",") });
    await this.request(
      `/Collections/${encodeURIComponent(collectionId)}/Items?${params.toString()}`,
      { method: "DELETE" },
      false,
    );
  }
}
