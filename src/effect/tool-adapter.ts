import { Cause, Effect } from "effect";
import { runAsMcpTool, toMcpResult } from "@lidless-labs/effect-operator-kit";
import { fail } from "../tools/_util.js";

type ToolResult = ReturnType<typeof fail>;

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
export const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export const runPromise = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(effect);

/**
 * Convert an Effect with arbitrary failures into always-succeeding ToolResult.
 * Pre-maps failures through repo `fail(unknown)`, then delegates the
 * never-failing envelope to kit `toMcpResult`.
 *
 * Semantic wrap: kit `toMcpResult` normally uses `fail(operatorErrorMessage(...))`
 * on the error channel; this repo pins `fail(unknown)` message extraction instead.
 */
export const toolResult = (
  effect: Effect.Effect<ToolResult, unknown, never>,
): Effect.Effect<ToolResult, never, never> =>
  toMcpResult(
    Effect.either(Effect.sandbox(effect)).pipe(
      Effect.flatMap((result) =>
        result._tag === "Left"
          ? Effect.succeed(fail(Cause.squash(result.left)))
          : Effect.succeed(result.right),
      ),
    ),
  );

/**
 * MCP tool handler wrapper. Delegates async execution to kit `runAsMcpTool` but
 * keeps synchronous throws on repo `fail(unknown)` (kit uses operatorErrorMessage
 * + redact on catch).
 */
export const toToolHandler =
  <Args>(
    handler: (args: Args) => Effect.Effect<ToolResult, unknown, never>,
  ): ((args: Args) => Promise<ToolResult>) =>
  (args) => {
    try {
      return runAsMcpTool(toolResult(handler(args)));
    } catch (error) {
      return Promise.resolve(fail(error));
    }
  };
