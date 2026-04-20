import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail } from "./_util.js";

export function registerUserTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_list_users",
    "List all Jellyfin users with admin/disabled status and last login/activity timestamps.",
    {},
    async () => {
      try {
        const users = await client.listUsers();
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
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_create_user",
    "Create a new Jellyfin user. Returns the new user's ID. Pass a password separately via jellyfin_set_user_password.",
    {
      name: z.string().min(1).describe("Username for the new account"),
    },
    async ({ name }) => {
      try {
        const user = await client.createUser(name);
        return ok({
          id: user.Id,
          name: user.Name,
          note: "Password not set. Use jellyfin_set_user_password to set one.",
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_delete_user",
    "Delete a Jellyfin user permanently. This does NOT delete their watch history or associated items — only the account.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
    },
    async ({ userId }) => {
      try {
        await client.deleteUser(userId);
        return ok({ result: `user ${userId} deleted` });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_user_disabled",
    "Enable or disable a Jellyfin user account. Disabled users can't log in but their data is preserved.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      disabled: z.boolean().describe("true to disable, false to re-enable"),
    },
    async ({ userId, disabled }) => {
      try {
        await client.setUserDisabled(userId, disabled);
        return ok({
          result: `user ${userId} ${disabled ? "disabled" : "enabled"}`,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_set_user_password",
    "Set (or reset) a Jellyfin user's password.",
    {
      userId: z.string().describe("User ID from jellyfin_list_users"),
      newPassword: z.string().min(1).describe("The new password in plaintext (Jellyfin hashes server-side)"),
    },
    async ({ userId, newPassword }) => {
      try {
        await client.setUserPassword(userId, newPassword);
        return ok({ result: `password updated for user ${userId}` });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
