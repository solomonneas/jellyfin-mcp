import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import type { JellyfinClient } from "../client.js";
import { toToolHandler } from "../effect/tool-adapter.js";
import { ok, fail, DESTRUCTIVE, NON_DESTRUCTIVE } from "./_util.js";

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export function registerCollectionTools(server: McpServer, client: JellyfinClient): void {
  server.tool(
    "jellyfin_create_collection",
    "Create a new collection (BoxSet), optionally pre-populated with items. Collections are server-wide, not per-user.",
    {
      name: z.string().min(1).describe("Collection name"),
      itemIds: z
        .array(z.string().min(1))
        .optional()
        .default([])
        .describe("Optional initial item IDs"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ name, itemIds }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          fromPromise(() => client.createCollection(name, itemIds)),
        );
        if (result._tag === "Left") return fail(result.left);
        return ok({ id: result.right.Id, name });
      }),
    ),
  );

  server.tool(
    "jellyfin_add_to_collection",
    "Add items to an existing collection.",
    {
      collectionId: z.string().describe("Collection ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to add"),
    },
    NON_DESTRUCTIVE,
    toToolHandler(({ collectionId, itemIds }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          fromPromise(() => client.addToCollection(collectionId, itemIds)),
        );
        if (result._tag === "Left") return fail(result.left);
        return ok({ result: `added ${itemIds.length} item(s) to collection ${collectionId}` });
      }),
    ),
  );

  server.tool(
    "jellyfin_remove_from_collection",
    "Remove items from a collection.",
    {
      collectionId: z.string().describe("Collection ID"),
      itemIds: z.array(z.string().min(1)).min(1).describe("Item IDs to remove"),
    },
    DESTRUCTIVE,
    toToolHandler(({ collectionId, itemIds }) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          fromPromise(() => client.removeFromCollection(collectionId, itemIds)),
        );
        if (result._tag === "Left") return fail(result.left);
        return ok({
          result: `removed ${itemIds.length} item(s) from collection ${collectionId}`,
        });
      }),
    ),
  );
}
