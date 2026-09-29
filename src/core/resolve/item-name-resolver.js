import { nodeToJs } from "../parser/snbt.js";
import { MinecraftText } from "../model/minecraft-text.js";

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

function nameFromPath(pathValue) {
  return String(pathValue ?? "")
    .split(/[._/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function plainLanguageValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => plainLanguageValue(entry) ?? "").join("\n");
  }
  if (typeof value === "object") return null;
  return String(value);
}

export class ItemNameResolver {
  constructor(assetResolver, options = {}) {
    this.assetResolver = assetResolver;
    this.locale = options.locale ?? "zh_cn";
    this.fallbackLocale = options.fallbackLocale ?? "en_us";
    this.languageCache = new Map();
  }

  language(namespace, locale) {
    const key = `${namespace}:${locale}`;
    if (this.languageCache.has(key)) return this.languageCache.get(key);
    const language = this.assetResolver.readJsonAsset(namespace, `lang/${locale}.json`);
    this.languageCache.set(key, language && typeof language === "object" ? language : null);
    return this.languageCache.get(key);
  }

  lookup(namespace, key) {
    for (const locale of [this.locale, this.fallbackLocale, "en_us"]) {
      const value = plainLanguageValue(this.language(namespace, locale)?.[key]);
      if (value != null) return { value, locale };
    }
    return null;
  }

  componentName(component, namespace) {
    if (component == null) return null;
    const value = nodeToJs(component);
    const text = new MinecraftText(value, {
      resolveTranslation: (key) => this.lookup(namespace, key)?.value ?? null
    });
    const plainText = text.plainText.trim();
    return plainText || null;
  }

  resolve(itemOrId) {
    const itemId = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
    const parsed = parseResourceRef(itemId);
    if (!parsed) {
      return {
        itemId: itemId ?? "",
        displayName: "",
        source: "invalid"
      };
    }

    if (itemOrId && typeof itemOrId === "object") {
      for (const componentId of ["minecraft:custom_name", "minecraft:item_name"]) {
        const component = itemOrId.getComponent?.(componentId);
        const customName = this.componentName(component, parsed.namespace);
        if (customName) {
          return {
            itemId,
            displayName: customName,
            source: "component",
            componentId,
            translationKey: null
          };
        }
      }
    }

    const keys = [
      `item.${parsed.namespace}.${parsed.path}`,
      `block.${parsed.namespace}.${parsed.path}`,
      `item.${parsed.path}`,
      `block.${parsed.path}`
    ];
    for (const key of keys) {
      const resolved = this.lookup(parsed.namespace, key);
      if (resolved) {
        return {
          itemId,
          displayName: resolved.value,
          source: "language",
          translationKey: key,
          locale: resolved.locale
        };
      }
    }

    return {
      itemId,
      displayName: nameFromPath(parsed.path),
      source: "path",
      translationKey: null
    };
  }
}

export function createItemNameResolver(assetResolver, options = {}) {
  return new ItemNameResolver(assetResolver, options);
}
