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
} from "./types.js";

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
}
