import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { ok, fail, refuseUnconfirmed } from "./_util.js";

export function registerQuickConnectTools(
  server: McpServer,
  client: JellyfinClient,
): void {
  server.tool(
    "jellyfin_quick_connect_status",
    "Check whether Quick Connect is enabled on the server. Quick Connect lets a user log in on a new client by entering a 6-character code on an already-authenticated client.",
    {},
    async () => {
      try {
        const enabled = await client.getQuickConnectEnabled();
        return ok({ enabled });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "jellyfin_quick_connect_authorize",
    "Authorize a pending Quick Connect code for a specific user. The user's new client will then be granted a session for that user account. Requires confirm: true because this grants authenticated access to the specified user's account.",
    {
      code: z
        .string()
        .min(1)
        .describe("The Quick Connect code shown on the new client (typically 6 characters)."),
      userId: z
        .string()
        .min(1)
        .describe("User ID the new client will be authenticated as. Use jellyfin_list_users to find IDs."),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true to proceed — this grants a session to the specified user account."),
    },
    async ({ code, userId, confirm }) => {
      if (!confirm) {
        // Don't echo the code back — it's a short-lived auth secret, and tool
        // output/logs are often captured by MCP clients. Identifying the user
        // is enough for the operator to know which approval they're reviewing.
        return refuseUnconfirmed(
          `authorize the pending Quick Connect code for user ${userId}`,
        );
      }
      try {
        const authorized = await client.authorizeQuickConnect(code, userId);
        return ok({ userId, authorized });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
