export interface JellyfinConfig {
  url: string;
  apiKey: string;
  verifySsl: boolean;
  timeout: number;
}

export function getConfig(): JellyfinConfig {
  const url = process.env.JELLYFIN_URL;
  if (!url) {
    throw new Error("JELLYFIN_URL environment variable is required (e.g. http://localhost:8096)");
  }

  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "JELLYFIN_API_KEY environment variable is required. Generate one in Jellyfin: Dashboard > API Keys.",
    );
  }

  const verifySsl = process.env.JELLYFIN_VERIFY_SSL !== "false";
  const timeout = parseInt(process.env.JELLYFIN_TIMEOUT ?? "30", 10) * 1000;

  return {
    url: url.replace(/\/+$/, ""),
    apiKey,
    verifySsl,
    timeout,
  };
}
