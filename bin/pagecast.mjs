#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "cli", "index.ts");
const tsx = join(here, "..", "node_modules", ".bin", "tsx");

const child = spawn(tsx, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

let exiting = false;
function forward(signal) {
  if (exiting) return;
  child.kill(signal);
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));

child.on("exit", (code) => process.exit(code ?? 0));
