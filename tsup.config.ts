import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/mcp-bin.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  // Each bin must be self-contained; no shared chunk imports between the two
  // executables and the server module.
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
