#!/usr/bin/env node
/**
 * Runs exactly `vite build` (default SPA config). Used from npm `build` so a mistaken
 * `npm run build desktop` does not invoke `vite build desktop` (Vite would treat `desktop`
 * as the project root and fail on desktop/index.html).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const r = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
