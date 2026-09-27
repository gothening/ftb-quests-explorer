import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function mimeForFile(filePath) {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function parseResourceRef(ref) {
  const value = String(ref ?? "").trim();
  if (!value) return null;
  const colon = value.indexOf(":");
  if (colon < 0) return { namespace: "minecraft", path: value };
  return {
    namespace: value.slice(0, colon).toLowerCase(),
    path: value.slice(colon + 1).replace(/^\/+/, "")
  };
}

function asPngPath(resourcePath) {
  const value = String(resourcePath ?? "").replace(/^\/+/, "");
  if (!value) return "";
  return value.toLowerCase().endsWith(".png") ? value : `${value}.png`;
}

export class ZipArchive {
  constructor(filePath) {
    this.filePath = filePath;
    this.entries = null;
  }

  load() {
    if (this.entries) return this.entries;
    const stat = fs.statSync(this.filePath);
    const tailSize = Math.min(stat.size, 65_557);
    const tail = Buffer.alloc(tailSize);
    const fd = fs.openSync(this.filePath, "r");
    try {
      fs.readSync(fd, tail, 0, tailSize, Math.max(0, stat.size - tailSize));
    } finally {
      fs.closeSync(fd);
    }

    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index--) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new Error(`ZIP end-of-central-directory not found: ${this.filePath}`);

    const entryCount = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (centralOffset === 0xFFFFFFFF || centralSize === 0xFFFFFFFF || entryCount === 0xFFFF) {
      throw new Error(`ZIP64 is not supported: ${this.filePath}`);
    }

    const central = Buffer.alloc(centralSize);
    const centralFd = fs.openSync(this.filePath, "r");
    try {
      fs.readSync(centralFd, central, 0, centralSize, centralOffset);
    } finally {
      fs.closeSync(centralFd);
    }

    const entries = new Map();
    let offset = 0;
    for (let index = 0; index < entryCount; index++) {
      if (central.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
      const method = central.readUInt16LE(offset + 10);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const nameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const localOffset = central.readUInt32LE(offset + 42);
      const name = central.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
      entries.set(name, {
        name,
        method,
        compressedSize,
        uncompressedSize,
        localOffset
      });
      offset += 46 + nameLength + extraLength + commentLength;
    }

    this.entries = entries;
    return entries;
  }

  read(entryName) {
    const entry = this.load().get(entryName);
    if (!entry) return null;

    const header = Buffer.alloc(30);
    const fd = fs.openSync(this.filePath, "r");
    try {
      fs.readSync(fd, header, 0, header.length, entry.localOffset);
      if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
        throw new Error(`Invalid ZIP local header for ${entryName}`);
      }
      const nameLength = header.readUInt16LE(26);
      const extraLength = header.readUInt16LE(28);
      const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
      const compressed = Buffer.alloc(entry.compressedSize);
      fs.readSync(fd, compressed, 0, compressed.length, dataOffset);
      if (entry.method === 0) return compressed;
      if (entry.method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method ${entry.method} in ${entryName}`);
    } finally {
      fs.closeSync(fd);
    }
  }
}

export class FilesystemAssetResolver {
  constructor(roots) {
    this.roots = roots.filter((root) => root && fs.existsSync(root));
  }

  resolve(namespace, resourcePath) {
    const relative = path.join("assets", namespace, ...resourcePath.split("/"));
    for (const root of this.roots) {
      const target = path.resolve(root, relative);
      if (!target.startsWith(path.resolve(root))) continue;
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      return {
        data: fs.readFileSync(target),
        mime: mimeForFile(target),
        source: target
      };
    }
    return null;
  }
}

export class ModJarAssetResolver {
  constructor(jarPaths) {
    this.jarPaths = jarPaths;
    this.index = null;
    this.archiveCache = new Map();
  }

  archive(jarPath) {
    if (!this.archiveCache.has(jarPath)) this.archiveCache.set(jarPath, new ZipArchive(jarPath));
    return this.archiveCache.get(jarPath);
  }

  buildIndex() {
    if (this.index) return this.index;
    const index = new Map();
    for (const jarPath of this.jarPaths) {
      let archive;
      try {
        archive = this.archive(jarPath);
        for (const entryName of archive.load().keys()) {
          if (!entryName.startsWith("assets/")) continue;
          const parts = entryName.split("/");
          if (parts.length < 4) continue;
          const namespace = parts[1];
          const resourcePath = parts.slice(2).join("/");
          const key = `${namespace}:${resourcePath}`;
          if (!index.has(key)) index.set(key, { jarPath, entryName });
        }
      } catch {
        // A malformed or ZIP64 archive is skipped; other jars can still resolve.
      }
    }
    this.index = index;
    return index;
  }

  resolve(namespace, resourcePath) {
    try {
      const found = this.buildIndex().get(`${namespace}:${resourcePath}`);
      if (!found) return null;
      const data = this.archive(found.jarPath).read(found.entryName);
      if (!data) return null;
      return {
        data,
        mime: mimeForFile(found.entryName),
        source: `${found.jarPath}!/${found.entryName}`
      };
    } catch {
      return null;
    }
  }
}

export class MinecraftAssetResolver {
  constructor(instanceRoot, minecraftVersion) {
    this.minecraftRoot = path.resolve(instanceRoot, "..", "..");
    this.minecraftVersion = minecraftVersion || "1.21.1";
    this.clientJar = path.join(this.minecraftRoot, "versions", this.minecraftVersion, `${this.minecraftVersion}.jar`);
    this.clientResolver = fs.existsSync(this.clientJar)
      ? new ModJarAssetResolver([this.clientJar])
      : null;
    this.assetObjects = new Map();
    this.loadAssetIndex();
  }

  loadAssetIndex() {
    try {
      const versionJsonPath = path.join(
        this.minecraftRoot,
        "versions",
        this.minecraftVersion,
        `${this.minecraftVersion}.json`
      );
      const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
      const indexId = versionJson?.assetIndex?.id;
      if (!indexId) return;
      const indexPath = path.join(this.minecraftRoot, "assets", "indexes", `${indexId}.json`);
      const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      for (const [resourcePath, entry] of Object.entries(index.objects ?? {})) {
        if (entry?.hash) this.assetObjects.set(resourcePath, entry.hash);
      }
    } catch {
      // The client jar or filesystem resource packs remain usable without the asset index.
    }
  }

  resolve(namespace, resourcePath) {
    if (namespace !== "minecraft") return null;
    const fromJar = this.clientResolver?.resolve("minecraft", resourcePath);
    if (fromJar) return fromJar;

    const hash = this.assetObjects.get(resourcePath)
      ?? this.assetObjects.get(`minecraft/${resourcePath}`);
    if (!hash) return null;
    const objectPath = path.join(this.minecraftRoot, "assets", "objects", hash.slice(0, 2), hash);
    if (!fs.existsSync(objectPath)) return null;
    return {
      data: fs.readFileSync(objectPath),
      mime: mimeForFile(resourcePath),
      source: objectPath
    };
  }
}

export class ResourceResolver {
  constructor({ instanceRoot, minecraftVersion = "1.21.1" }) {
    this.instanceRoot = path.resolve(instanceRoot);
    const resourcePackRoots = [
      ...this.enumerateResourcePacks(path.join(this.instanceRoot, "resourcepacks")),
      path.join(this.instanceRoot, "kubejs"),
      ...this.enumerateResourcePacks(path.join(this.instanceRoot, "..", "..", "resourcepacks"))
    ];
    this.filesystem = new FilesystemAssetResolver([
      ...resourcePackRoots
    ]);
    this.modJars = new ModJarAssetResolver(this.findModJars());
    this.minecraft = new MinecraftAssetResolver(this.instanceRoot, minecraftVersion);
    this.itemIconCache = new Map();
  }

  findModJars() {
    const modsDirectory = path.join(this.instanceRoot, "mods");
    if (!fs.existsSync(modsDirectory)) return [];
    return fs.readdirSync(modsDirectory)
      .filter((entry) => entry.toLowerCase().endsWith(".jar"))
      .map((entry) => path.join(modsDirectory, entry));
  }

  enumerateResourcePacks(directory) {
    if (!directory || !fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .map((entry) => path.join(directory, entry))
      .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isDirectory());
  }

  resolveAsset(namespace, resourcePath) {
    const normalizedNamespace = String(namespace || "minecraft").toLowerCase();
    const normalizedPath = String(resourcePath || "").replace(/^\/+/, "");
    return this.filesystem.resolve(normalizedNamespace, normalizedPath)
      ?? this.minecraft.resolve(normalizedNamespace, normalizedPath)
      ?? this.modJars.resolve(normalizedNamespace, normalizedPath);
  }

  resolve(ref) {
    const parsed = parseResourceRef(ref);
    if (!parsed) return null;
    return this.resolveAsset(parsed.namespace, asPngPath(parsed.path));
  }

  resolveImage(ref) {
    const parsed = parseResourceRef(ref);
    if (!parsed) return null;
    let resourcePath = parsed.path;
    if (!resourcePath.startsWith("textures/") && !resourcePath.startsWith("icons/")) {
      resourcePath = `textures/${resourcePath}`;
    } else if (resourcePath.startsWith("icons/")) {
      resourcePath = `textures/${resourcePath}`;
    }
    return this.resolveAsset(parsed.namespace, asPngPath(resourcePath));
  }

  resolveItemIcon(itemId) {
    if (this.itemIconCache.has(itemId)) return this.itemIconCache.get(itemId);
    const parsed = parseResourceRef(itemId);
    if (!parsed || !parsed.path) return null;
    const candidates = [
      `textures/item/${parsed.path}.png`,
      `textures/block/${parsed.path}.png`
    ];
    for (const candidate of candidates) {
      const resolved = this.resolveAsset(parsed.namespace, candidate);
      if (resolved) {
        this.itemIconCache.set(itemId, resolved);
        return resolved;
      }
    }

    const model = this.resolveItemModel(parsed.namespace, parsed.path, new Set());
    const resolved = model ? this.resolveModelTexture(model, parsed.namespace, new Set()) : null;
    this.itemIconCache.set(itemId, resolved);
    return resolved;
  }

  readJsonAsset(namespace, resourcePath) {
    const resolved = this.resolveAsset(namespace, resourcePath);
    if (!resolved) return null;
    try {
      return JSON.parse(resolved.data.toString("utf8"));
    } catch {
      return null;
    }
  }

  resolveItemModel(namespace, modelPath, seen) {
    const normalized = String(modelPath || "").replace(/^\/+/, "");
    if (!normalized) return null;
    const key = `${namespace}:${normalized}`;
    if (seen.has(key) || seen.size > 32) return null;
    seen.add(key);

    const modelCandidates = [];
    if (normalized.startsWith("item/") || normalized.startsWith("block/")) {
      modelCandidates.push(`models/${normalized}.json`);
    } else {
      modelCandidates.push(`models/item/${normalized}.json`);
      modelCandidates.push(`models/block/${normalized}.json`);
    }

    let model = null;
    for (const candidate of modelCandidates) {
      model = this.readJsonAsset(namespace, candidate);
      if (model) break;
    }
    if (!model) return null;

    if (model.parent) {
      const parent = parseResourceRef(model.parent);
      if (parent) {
        const parentModel = this.resolveItemModel(parent.namespace, parent.path, seen);
        if (parentModel) {
          return {
            ...parentModel,
            ...model,
            textures: {
              ...(parentModel.textures ?? {}),
              ...(model.textures ?? {})
            }
          };
        }
      }
    }
    return model;
  }

  resolveModelTexture(model, namespace, seen) {
    const textures = model?.textures ?? {};
    const keys = [
      "layer0", "layer1", "texture", "all", "top", "front", "side", "particle",
      ...Object.keys(textures)
    ];
    for (const key of keys) {
      if (!(key in textures)) continue;
      const resolved = this.resolveTextureRef(textures[key], textures, namespace, seen);
      if (resolved) return resolved;
    }
    return null;
  }

  resolveTextureRef(ref, textures, namespace, seen) {
    if (!ref || typeof ref !== "string") return null;
    if (ref.startsWith("#")) {
      const key = ref.slice(1);
      if (seen.has(key) || seen.size > 32) return null;
      seen.add(key);
      return this.resolveTextureRef(textures[key], textures, namespace, seen);
    }
    const parsed = parseResourceRef(ref);
    if (!parsed) return null;
    const textureNamespace = parsed.namespace || namespace;
    const texturePath = parsed.path.startsWith("textures/")
      ? parsed.path
      : `textures/${parsed.path}`;
    return this.resolveAsset(textureNamespace, asPngPath(texturePath));
  }

  fallbackPng() {
    return {
      data: TRANSPARENT_PNG,
      mime: "image/png",
      source: "builtin:transparent"
    };
  }

  fallbackImage() {
    return this.resolveAsset("ftbquests", "textures/gui/hidden.png")
      ?? this.resolveAsset("ftbquests", "textures/gui/info.png")
      ?? this.fallbackPng();
  }
}

export function createResourceResolver(instanceRoot, minecraftVersion) {
  return new ResourceResolver({ instanceRoot, minecraftVersion });
}
