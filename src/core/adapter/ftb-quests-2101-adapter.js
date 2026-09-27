import fs from "node:fs";
import path from "node:path";
import {
  loadQuestBook,
  resolveQuestRoot
} from "../parser/ftbq-loader.js";
import {
  parseSnbt
} from "../parser/snbt.js";
import {
  readInteger
} from "../model/common.js";

export class FtbQuests2101Adapter {
  constructor() {
    this.id = "ftbquests-2101";
    this.minecraftVersion = "1.21.1";
    this.dataVersion = 13;
  }

  canLoad(inputPath) {
    try {
      const root = resolveQuestRoot(inputPath);
      const dataPath = path.join(root, "data.snbt");
      const ast = parseSnbt(fs.readFileSync(dataPath, "utf8"));
      return readInteger(ast, "version", 0) === this.dataVersion;
    } catch {
      return false;
    }
  }

  load(inputPath, options = {}) {
    return loadQuestBook(inputPath, options);
  }
}

export class FtbQuestsVersionAdapter {
  constructor(adapters = [new FtbQuests2101Adapter()]) {
    this.adapters = adapters;
  }

  detect(inputPath) {
    return this.adapters.find((adapter) => adapter.canLoad(inputPath)) ?? null;
  }

  load(inputPath, options = {}) {
    const adapter = this.detect(inputPath);
    if (!adapter) throw new Error("No supported FTB Quests adapter found");
    return adapter.load(inputPath, options);
  }
}
