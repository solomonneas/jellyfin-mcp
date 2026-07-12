import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { toToolHandler } from "../effect/tool-adapter.js";
import { ok, fail, refuseUnconfirmed, DESTRUCTIVE, NON_DESTRUCTIVE, READ_ONLY } from "./_util.js";

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export function registerUserTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_users",
    "List all Jellyfin users with admin/disabled status and last login/activity timestamps.",
    {},
    READ_ONLY,
    toToolHandler(() =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.listUsers()));
        if (result._tag === "Left") return fail(result.left);
        const users = result.right;
        return ok(
          users.map((u) => ({
            id: u.Id,
            name: u.Name,
            isAdmin: u.Policy?.IsAdministrator ?? false,
            isDisabled: u.Policy?.IsDisabled ?? false,
            lastLogin: u.LastLoginDate ?? null,
            lastActivity: u.LastActivityDate ?? null,
          })),
        );
      }),
    ),
  );

  server.tool(
    "jellyfin_create_user",
    "Create a new Jellyfin user. Returns the new user's ID. Pass a password separately via jellyfin_set_user_password.",
    {
      name: z.string().min(1).describe("Username for the new account"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ name }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(fromPromise(() => client.createUser(name)));
        if (result._tag === "Left") return fail(result.left);
        const user = result.right;
        return ok({
          id: user.Id,
          name: user.Name,
          note: "Password not set. Use jellyfin_set_user_password to set one.",
        });
      }),
    ),
  );

  server.tool(
    "jellyfin_delete_user",
    "Delete a Jellyfin user permanently. Destructive and not undoable. Requires confirm: true.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true. Required acknowledgement that the account will be permanently deleted."),
    },
    DESTRUCTIVE,
    toToolHandler(({ userId, confirm }) =>
      Effect.gen(function* () {
        if (!confirm) return refuseUnconfirmed(`delete user ${userId}`);
        const result = yield* Effect.either(fromPromise(() => client.deleteUser(userId)));
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: `user ${userId} deleted` });
      }),
    ),
  );

  server.tool(
    "jellyfin_set_user_disabled",
    "Enable or disable a Jellyfin user account. Disabled users can't log in but their data is preserved.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      disabled: z.boolean().describe("true to disable, false to re-enable"),
    },
    DESTRUCTIVE,
    toToolHandler(({ userId, disabled }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          fromPromise(() => client.setUserDisabled(userId, disabled)),
        );
        if (result._tag === "Left") return fail(result.left);
        return ok({
          result: `user ${userId} ${disabled ? "disabled" : "enabled"}`,
        });
      }),
    ),
  );

  server.tool(
    "jellyfin_set_user_password",
    "Set (or reset) a Jellyfin user's password. Destructive: locks the user out of any old password. Requires confirm: true. Warning: the new password is passed as plaintext tool input, so it transits the LLM conversation, the provider's request logs, and any session transcript. Treat it as exposed: prefer a throwaway value the user changes in the Jellyfin UI afterwards.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      newPassword: z.string().min(1).describe("The new password in plaintext (Jellyfin hashes server-side)"),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true. Required acknowledgement that the existing password will be replaced."),
    },
    DESTRUCTIVE,
    toToolHandler(({ userId, newPassword, confirm }) =>
      Effect.gen(function* () {
        if (!confirm) return refuseUnconfirmed(`change the password for user ${userId}`);
        const result = yield* Effect.either(
          fromPromise(() => client.setUserPassword(userId, newPassword)),
        );
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: `password updated for user ${userId}` });
      }),
    ),
  );
}
