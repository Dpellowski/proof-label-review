import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".png": "image/png",
  ".json": "application/json",
};
http
  .createServer(async (req, res) => {
    try {
      let file = path.resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        if ((await stat(file)).isDirectory())
          file = path.join(file, "index.html");
      } catch {
        file = path.join(root, "index.html");
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("Proof preview: http://127.0.0.1:4173"),
  );
