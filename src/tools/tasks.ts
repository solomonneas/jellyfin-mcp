import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { toToolHandler } from "../effect/tool-adapter.js";
import { ok, fail, NON_DESTRUCTIVE, READ_ONLY } from "./_util.js";

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export function registerTaskTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_scheduled_tasks",
    "List all Jellyfin scheduled tasks with state (Idle/Running), progress %, and last execution info.",
    {},
    READ_ONLY,
    toToolHandler(() =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.listScheduledTasks()));
        if (result._tag === "Left") return fail(result.left);
        const tasks = result.right;
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
      }),
    ),
  );

  server.tool(
    "jellyfin_run_scheduled_task",
    "Trigger a scheduled task to run immediately. Use jellyfin_list_scheduled_tasks to discover IDs.",
    {
      taskId: z.string().describe("Task ID from jellyfin_list_scheduled_tasks"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ taskId }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.runScheduledTask(taskId)));
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: `task ${taskId} started` });
      }),
    ),
  );

  server.tool(
    "jellyfin_get_activity_log",
    "Get recent entries from Jellyfin's activity log (playback start/stop, login events, plugin updates, errors).",
    {
      limit: z.number().int().positive().max(200).optional().default(20),
      minDate: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp - only return entries newer than this (e.g. 2026-04-19T00:00:00Z)"),
    },
    READ_ONLY,
    toToolHandler(({ limit, minDate }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          fromPromise(() => client.getActivityLog(limit, minDate)),
        );
        if (result._tag === "Left") return fail(result.left);
        const log = result.right;
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
      }),
    ),
  );
}
