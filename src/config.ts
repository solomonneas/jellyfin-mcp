import { Effect } from "effect";
import {
  normalizeBaseUrl,
  parseTimeoutSeconds,
  readRequiredEnv,
} from "./effect/config.js";
import { MissingConfigError } from "./effect/errors.js";

export interface JellyfinConfig {
  url: string;
  apiKey: string;
  verifySsl: boolean;
  timeout: number;
}

const requireUrlMessage =
  "JELLYFIN_URL environment variable is required (e.g. http://localhost:8096)";
const requireApiKeyMessage =
  "JELLYFIN_API_KEY environment variable is required. Generate one in Jellyfin: Dashboard > API Keys.";

export function getConfig(): JellyfinConfig {
  const configEffect = Effect.gen(function* () {
    const url = yield* readRequiredEnv(process.env, "JELLYFIN_URL", requireUrlMessage);
    const apiKey = yield* readRequiredEnv(
      process.env,
      "JELLYFIN_API_KEY",
      requireApiKeyMessage,
    );
    const timeoutSeconds = yield* parseTimeoutSeconds(
      process.env.JELLYFIN_TIMEOUT,
      console.error,
    );

    return {
      url: normalizeBaseUrl(url),
      apiKey,
      verifySsl: process.env.JELLYFIN_VERIFY_SSL !== "false",
      timeout: timeoutSeconds * 1000,
    };
  });

  const result = Effect.runSync(Effect.either(configEffect));
  if (result._tag === "Left") {
    const error = result.left;
    if (error instanceof MissingConfigError) {
      throw new Error(error.message);
    }
    throw error;
  }

  return result.right;
}
