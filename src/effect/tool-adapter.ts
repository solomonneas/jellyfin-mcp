import { Effect } from "effect";
import { fail } from "../tools/_util.js";

type ToolResult = ReturnType<typeof fail>;

// Lift a Promise-returning client call into Effect, keeping the rejection
// value as the error channel so handlers can map it to fail() unchanged.
export const fromPromise = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: thunk, catch: (error) => error });

export const runPromise = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(effect);

export const toolResult = (
  effect: Effect.Effect<ToolResult, unknown, never>,
): Effect.Effect<ToolResult, never, never> =>
  Effect.either(effect).pipe(
    Effect.map((result) => (result._tag === "Left" ? fail(result.left) : result.right)),
  );

export const toToolHandler =
  <Args, A, E>(
    handler: (args: Args) => Effect.Effect<A, E, never>,
  ): ((args: Args) => Promise<A>) =>
  (args) =>
    runPromise(handler(args));
