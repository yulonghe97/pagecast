import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";

import { parseArtifact } from "../core/parser.js";
import { loadArtifactSource } from "../core/template.js";
import { loadRegistry, loadStyles } from "../core/registry.js";
import { validateArtifact, formatError } from "../core/validator.js";
import { applyDerivations } from "../core/derive.js";
import { exportToHtml } from "../render/export.js";
import { buildHydrationBundle, loadComponentMap } from "../render/loader.js";
import { collectHydrationPayload } from "../render/hydration.js";

export interface DevServerOptions {
  file: string;
  port: number;
}

export async function startDevServer(opts: DevServerOptions) {
  const abs = resolve(opts.file);

  async function renderCurrent(): Promise<string> {
    const reg = loadRegistry({ cwd: dirname(abs) });
    const source = loadArtifactSource(abs);
    const doc = parseArtifact(source, abs);
    const derive = applyDerivations(doc, reg, abs);
    const errors = [...derive.errors, ...validateArtifact(doc, reg)];
    if (errors.length > 0) {
      const lines = errors.map((e) => formatError(e)).join("\n\n");
      return errorPage(lines);
    }
    const components = await loadComponentMap(reg);
    const interactiveComponents = new Set<string>();
    for (const manifest of reg.manifests.values()) {
      if (manifest.interactive) interactiveComponents.add(manifest.name);
    }
    const payload = collectHydrationPayload(doc, interactiveComponents);
    const hydrationBundle = payload.islands.length > 0
      ? await buildHydrationBundle(reg)
      : null;
    const html = exportToHtml(doc, {
      components,
      interactiveComponents,
      extraCss: loadStyles(reg),
      hydrationBundle: hydrationBundle ?? undefined,
      hydrationData: hydrationBundle ? JSON.stringify(payload) : undefined,
      csp: false,
    });
    return injectLiveReloadScript(html, opts.port);
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.url === "/__health") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
        return;
      }
      const html = await renderCurrent();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String((err as Error).stack ?? err));
    }
  });

  const wss = new WebSocketServer({ server, path: "/__hmr" });
  const sockets = new Set<import("ws").WebSocket>();
  wss.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  const reg = loadRegistry({ cwd: dirname(abs) });
  const watchPaths = [abs, reg.root];
  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    persistent: true,
  });
  watcher.on("change", () => broadcast("reload"));
  watcher.on("add",    () => broadcast("reload"));
  watcher.on("unlink", () => broadcast("reload"));

  function broadcast(msg: string) {
    for (const s of sockets) {
      try { s.send(msg); } catch { /* ignore */ }
    }
  }

  await new Promise<void>((res) => server.listen(opts.port, res));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : opts.port;
  console.log(`pagecast dev: http://localhost:${actualPort}`);
  console.log(`watching: ${abs}`);
  console.log(`  and:    ${reg.root}`);

  const shutdown = async () => {
    await watcher.close();
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function errorPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Validation failed</title>
<style>body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#1c1917;color:#fecaca;padding:32px;}h1{color:#fca5a5;}pre{white-space:pre-wrap;background:#292524;padding:14px;border-radius:8px;}</style>
</head><body><h1>Validation failed</h1><pre>${escape(message)}</pre></body></html>`;
}

function injectLiveReloadScript(html: string, port: number): string {
  const script = `
<script>(function(){
  function connect(){
    var ws = new WebSocket("ws://"+location.host+"/__hmr");
    ws.onmessage = function(e){ if(e.data === "reload") location.reload(); };
    ws.onclose = function(){ setTimeout(connect, 500); };
  }
  connect();
})();</script>`;
  return html.replace("</body>", script + "</body>");
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
