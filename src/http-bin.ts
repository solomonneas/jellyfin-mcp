import { createHttpServer } from "./http.js";

createHttpServer()
  .then((server) => {
    const shutdown = (): void => {
      void server.close().then(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    console.error(`jellyfin-mcp HTTP listening on ${server.config.host}:${server.port}`);
  })
  .catch(() => {
    console.error("jellyfin-mcp HTTP failed to start");
    process.exit(1);
  });
