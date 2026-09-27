import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const port = Number(process.env.PREVIEW_PORT || 4174);
const normalizedBasePath = `/${(process.env.PREVIEW_BASE_PATH || "").replace(/^\/+|\/+$/g, "")}/`;
const basePath = normalizedBasePath === "//" ? "/" : normalizedBasePath;
const basePrefix = basePath === "/" ? "" : basePath.slice(0, -1);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  let requested;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  let relative;
  if (!basePrefix) {
    relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  } else if (requested === basePrefix || requested === `${basePrefix}/`) {
    relative = "index.html";
  } else if (requested.startsWith(`${basePrefix}/`)) {
    relative = requested.slice(basePrefix.length + 1);
  } else {
    response.writeHead(302, { Location: basePath });
    response.end();
    return;
  }

  let target = path.resolve(distRoot, relative);
  const resolvedDistRoot = path.resolve(distRoot);
  if (target !== resolvedDistRoot && !target.startsWith(`${resolvedDistRoot}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    target = path.join(distRoot, "index.html");
  }
  const extension = path.extname(target).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(target).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static preview: http://127.0.0.1:${port}${basePath}`);
  console.log(`Serving: ${distRoot}`);
});
