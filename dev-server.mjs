import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadQuestBook,
  validate
} from "./src/core/index.js";
import { buildViewerModel } from "./src/viewer/view-model.js";
import {
  createSearchIndex,
  searchViewer
} from "./src/viewer/search.js";
import {
  createResourceResolver
} from "./src/server/resource-resolver.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(projectRoot, "frontend");
const sourceRoot = path.join(projectRoot, "src");
const defaultQuestRoot = path.resolve(projectRoot, "..", "config", "ftbquests", "quests");
const port = Number(process.env.PORT || 4173);
const cache = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8"
};

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function resolveBook(inputPath, locale, refresh = false) {
  const root = inputPath ? path.resolve(inputPath) : defaultQuestRoot;
  const key = `${root}::${locale}`;
  if (refresh) cache.delete(key);
  if (cache.has(key)) return cache.get(key);
  const book = loadQuestBook(root, { locale });
  const validation = validate(book);
  const model = buildViewerModel(book, validation, { locale });
  const entry = {
    book,
    validation,
    model,
    index: createSearchIndex(model),
    resolver: createResourceResolver(
      model.metadata.instanceRoot ?? path.resolve(projectRoot, ".."),
      model.metadata.minecraftVersion
    )
  };
  cache.set(key, entry);
  return entry;
}

function binary(response, status, buffer, mime, source) {
  response.writeHead(status, {
    "Content-Type": mime,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
    "X-Resource-Source": encodeURIComponent(source ?? "")
  });
  response.end(buffer);
}

function staticResponse(requestPath, response) {
  const decoded = decodeURIComponent(requestPath);
  let root = frontendRoot;
  let relative = decoded;
  if (decoded === "/" || decoded === "") relative = "/index.html";
  if (decoded.startsWith("/src/")) {
    root = sourceRoot;
    relative = decoded.slice(4);
  } else if (decoded.startsWith("/frontend/")) {
    root = frontendRoot;
    relative = decoded.slice("/frontend".length);
  }

  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(path.resolve(root))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const extension = path.extname(target).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(target).pipe(response);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/load") {
    try {
      const body = await readJson(request);
      const locale = String(body.locale || "zh_cn");
      const entry = resolveBook(body.path ? String(body.path) : "", locale, Boolean(body.refresh));
      json(response, 200, entry.model);
    } catch (error) {
      json(response, 400, { error: String(error.message || error) });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/search") {
    try {
      const body = await readJson(request);
      const locale = String(body.locale || "zh_cn");
      const entry = resolveBook(body.path ? String(body.path) : "", locale, false);
      json(response, 200, {
        results: searchViewer(entry.index, body.query || "", Number(body.limit || 200))
      });
    } catch (error) {
      json(response, 400, { error: String(error.message || error) });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, {
      ok: true,
      defaultQuestRoot,
      cachedBooks: cache.size
    });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/api/asset" || url.pathname === "/api/item-icon")) {
    try {
      const entry = resolveBook(
        url.searchParams.get("path") || "",
        url.searchParams.get("locale") || "zh_cn",
        false
      );
      const resolved = url.pathname === "/api/item-icon"
        ? entry.resolver.resolveItemIcon(url.searchParams.get("id") || "")
        : entry.resolver.resolveImage(url.searchParams.get("ref") || "");
      const fallback = resolved ? null : entry.resolver.fallbackImage();
      const result = resolved ?? fallback;
      if (!resolved) response.setHeader("X-Resource-Missing", "1");
      binary(response, 200, result.data, result.mime, result.source);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(String(error.stack || error));
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  staticResponse(url.pathname, response);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(String(error.stack || error));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FTB Quests Explorer read-only viewer: http://127.0.0.1:${port}`);
  console.log(`Default quest root: ${defaultQuestRoot}`);
});
