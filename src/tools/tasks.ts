import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerTaskTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_scheduled_tasks",
    "List all Jellyfin scheduled tasks with state (Idle/Running), progress %, and last execution info.",
    {},
    async () => {
      try {
        const tasks = await client.listScheduledTasks();
        return ok(
          tasks.map((t) => ({
            id: t.Id,
            name: t.Name,
            category: t.Category ?? null,
            state: t.State,
            progressPercent: t.CurrentProgressPercentage ?? null,
            lastStart: t.LastExecutionResult?.StartTimeUtc ?? null,
            lastEnd: t.LastExecutionResult?.EndTimeUtc ?? null,
            lastStatus: t.LastExecutionResult?.Status ?? null,
            lastError: t.LastExecutionResult?.ErrorMessage ?? null,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_run_scheduled_task",
    "Trigger a scheduled task to run immediately. Use jellyfin_list_scheduled_tasks to discover IDs.",
    {
      taskId: z.string().describe("Task ID from jellyfin_list_scheduled_tasks"),
    },
    async ({ taskId }) => {
      try {
        await client.runScheduledTask(taskId);
        return ok({ result: `task ${taskId} started` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_get_activity_log",
    "Get recent entries from Jellyfin's activity log (playback start/stop, login events, plugin updates, errors).",
    {
      limit: z.number().int().positive().max(200).optional().default(20),
      minDate: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp — only return entries newer than this (e.g. 2026-04-19T00:00:00Z)"),
    },
    async ({ limit, minDate }) => {
      try {
        const log = await client.getActivityLog(limit, minDate);
        return ok({
          totalCount: log.TotalRecordCount,
          entries: log.Items.map((e) => ({
            id: e.Id,
            date: e.Date,
            severity: e.Severity,
            type: e.Type,
            name: e.Name,
            userId: e.UserId ?? null,
            summary: e.ShortOverview ?? null,
            detail: e.Overview ?? null,
          })),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
