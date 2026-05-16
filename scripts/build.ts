import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const result = spawnSync(
  process.execPath,
  [resolve(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
  { cwd: root, stdio: "inherit" }
);

process.exit(result.status ?? 1);
