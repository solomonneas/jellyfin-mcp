import { Effect } from "effect";

export const runPromise = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(effect);

export const toToolHandler =
  <Args, A, E>(
    handler: (args: Args) => Effect.Effect<A, E, never>,
  ): ((args: Args) => Promise<A>) =>
  (args) =>
    runPromise(handler(args));
