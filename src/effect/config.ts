import { Effect } from "effect";
import { InvalidTimeoutError, MissingConfigError } from "./errors.js";

export const DEFAULT_TIMEOUT_SECONDS = 30;

export interface ConfigInput {
  readonly env: NodeJS.ProcessEnv;
  readonly warn: (message: string) => void;
}

export const readRequiredEnv = (
  env: NodeJS.ProcessEnv,
  variable: string,
  message: string,
) =>
  Effect.sync(() => env[variable]).pipe(
    Effect.flatMap((value) =>
      value
        ? Effect.succeed(value)
        : Effect.fail(new MissingConfigError({ variable, message })),
    ),
  );

export const parseTimeoutSeconds = (
  raw: string | undefined,
  warn: (message: string) => void,
) =>
  Effect.gen(function* () {
    if (raw === undefined || raw.trim() === "") {
      return DEFAULT_TIMEOUT_SECONDS;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    const error = new InvalidTimeoutError({
      raw,
      fallbackSeconds: DEFAULT_TIMEOUT_SECONDS,
    });
    warn(formatInvalidTimeoutWarning(error));
    return DEFAULT_TIMEOUT_SECONDS;
  });

export const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

export const formatInvalidTimeoutWarning = (error: InvalidTimeoutError): string =>
  `jellyfin-mcp: invalid JELLYFIN_TIMEOUT "${error.raw}" (expected a positive number of seconds); using default ${error.fallbackSeconds}s`;
