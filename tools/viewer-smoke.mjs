import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["dev-server.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("viewer server did not start");
}

async function loadModel() {
  const response = await fetch(`${baseUrl}/api/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "zh_cn" })
  });
  return response.json();
}

function slug(value) {
  return String(value).replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-|-$/g, "");
}

async function selectChapter(page, chapterId) {
  const button = page.locator(`.ftbq-chapter-button[data-chapter-id="${chapterId}"]`);
  if (!(await button.count())) {
    await page.evaluate(() => {
      document.querySelectorAll(".ftbq-group-arrow").forEach((image) => {
        if (image.src.includes("arrow_collapsed")) image.closest("button")?.click();
      });
    });
    await page.waitForTimeout(200);
  }
  await page.locator(`.ftbq-chapter-button[data-chapter-id="${chapterId}"]`).click();
  await page.waitForTimeout(300);
}

async function selectQuest(page, questId) {
  const button = page.locator(`.ftbq-quest-button[data-quest-id="${questId}"]`);
  if (!(await button.count())) return false;
  await button.click();
  await page.waitForTimeout(250);
  return true;
}

async function main() {
  await waitForServer();
  const model = await loadModel();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".ftbq-quest-button", { timeout: 20000 });
  await page.waitForTimeout(800);

  const evidence = {
    baseUrl,
    readonly: await page.locator(".ftbq-readonly").textContent(),
    groups: [],
    screenshots: [],
    chapterImages: null,
    crossChapter: null,
    viewQuest: null,
    search: null,
    diagnostics: null,
    responsive: [],
    consoleErrors
  };

  const screenshotDir = path.resolve("docs");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const preferredChapters = {
    "开拓之路": "4DC9553CE2E60992",
    "瓦尔特": "4A8D4426BF9C8151",
    "丹恒": "444EBDC4D1EF627C",
    "三月七": "1B0B450CB9A3322D",
    "姬子": "3BDFA3F494F23874"
  };

  for (const groupName of ["开拓之路", "瓦尔特", "丹恒", "三月七", "姬子"]) {
    const group = model.groups.find((entry) => entry.title?.plainText?.includes(groupName));
    if (!group) {
      evidence.groups.push({ groupName, found: false });
      continue;
    }

    const groupChapters = group.chapterIds
      .map((id) => model.chapters.find((chapter) => chapter.id === id))
      .filter(Boolean);
    const chapter = model.chapters.find((entry) => entry.id === preferredChapters[groupName])
      ?? groupChapters.slice().sort((left, right) => right.questCount - left.questCount)[0]
      ?? model.chapters[0];
    await selectChapter(page, chapter.id);

    const firstQuest = model.quests
      .filter((quest) => quest.chapterId === chapter.id)
      .sort((left, right) => (right.tasks.length + right.rewards.length) - (left.tasks.length + left.rewards.length))[0];
    if (await page.locator("#viewQuestPanel").isVisible()) {
      await page.locator("#closeViewQuestBtn").click();
      await page.waitForTimeout(150);
    }

    const shotPath = path.join(screenshotDir, `phase2b-${slug(groupName)}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    evidence.screenshots.push(shotPath);
    let detailPath = null;
    if (firstQuest && await selectQuest(page, firstQuest.id)) {
      detailPath = path.join(screenshotDir, `phase2b-${slug(groupName)}-detail.png`);
      await page.screenshot({ path: detailPath, fullPage: true });
      evidence.screenshots.push(detailPath);
    }
    evidence.groups.push({
      groupName,
      found: true,
      chapterId: chapter.id,
      chapterTitle: chapter.title?.plainText ?? chapter.id,
      quests: await page.locator(".ftbq-quest-button").count(),
      dependencies: await page.locator(".ftbq-link-layer path").count(),
      images: await page.locator(".ftbq-image-node").count(),
      selectedQuest: await page.locator(".ftbq-quest-button.selected").count(),
      graphScreenshot: shotPath,
      detailScreenshot: detailPath
    });
  }

  const questWithTasks = model.quests.find((quest) => quest.tasks.length > 0 && quest.rewards.length > 0);
  await selectChapter(page, questWithTasks.chapterId);
  await selectQuest(page, questWithTasks.id);
  evidence.viewQuest = {
    questId: questWithTasks.id,
    visible: await page.locator("#viewQuestPanel").isVisible(),
    tasks: await page.locator(".ftbq-task-button").count(),
    rewards: await page.locator(".ftbq-reward-button").count(),
    taskIconsLoaded: await page.locator(".ftbq-task-button img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth > 0).length),
    rewardIconsLoaded: await page.locator(".ftbq-reward-button img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth > 0).length)
  };

  const imageChapter = model.chapters.find((chapter) => chapter.imageIds?.length > 0);
  if (imageChapter) {
    await selectChapter(page, imageChapter.id);
    evidence.chapterImages = {
      chapterId: imageChapter.id,
      count: await page.locator(".ftbq-image-node").count(),
      broken: await page.locator(".ftbq-image-node").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length)
    };
  }

  const crossEdge = model.edges.find((edge) => edge.crossChapter && edge.toChapterId);
  if (crossEdge) {
    await selectChapter(page, crossEdge.toChapterId);
    await selectQuest(page, crossEdge.to);
    evidence.crossChapter = {
      from: crossEdge.from,
      to: crossEdge.to,
      externalNodes: await page.locator(".ftbq-external-node").count(),
      dependencyPaths: await page.locator(".ftbq-link-layer path").count()
    };
  }

  const link = model.questLinks[0];
  if (link) {
    await selectChapter(page, link.chapterId);
    await page.locator(`.ftbq-quest-link-button[data-quest-id="${link.targetId}"]`).click();
    await page.waitForTimeout(200);
    evidence.questLink = {
      linkId: link.id,
      targetId: link.targetId,
      selected: await page.locator(".ftbq-quest-button.selected").getAttribute("data-quest-id")
    };
  }

  const tableReward = model.rewards.find((reward) => reward.rewardTableId);
  if (tableReward) {
    await selectChapter(page, tableReward.questId ? model.quests.find((quest) => quest.id === tableReward.questId).chapterId : model.chapters[0].id);
    await selectQuest(page, tableReward.questId);
    await page.locator(`.ftbq-reward-button[data-reward-table-id="${tableReward.rewardTableId}"]`).first().click();
    await page.waitForTimeout(200);
    evidence.rewardTable = {
      tableId: tableReward.rewardTableId,
      dialogOpen: await page.locator("#rewardDialog").evaluate((dialog) => dialog.open)
    };
    await page.locator("#closeRewardBtn").click();
  }

  const unknownTask = model.tasks.find((task) => task.type === "forge_energy");
  if (unknownTask) {
    const chapterId = model.quests.find((quest) => quest.id === unknownTask.questId)?.chapterId;
    await selectChapter(page, chapterId);
    await selectQuest(page, unknownTask.questId);
    const unknownButton = page.locator(`.ftbq-task-button[data-task-id="${unknownTask.id}"]`);
    const tooltipValue = await unknownButton.getAttribute("data-tooltip");
    evidence.unknownTask = {
      taskId: unknownTask.id,
      rendered: await unknownButton.count(),
      tooltipHasType: tooltipValue?.includes("forge_energy") ?? false
    };
  }

  await page.locator("#searchBtn").click();
  await page.locator("#searchInput").fill("forge_energy");
  await page.waitForTimeout(250);
  evidence.search = {
    results: await page.locator("#searchResults .ftbq-list-entry").count()
  };
  await page.locator("#closeSearchBtn").click();

  await page.locator("#diagnosticsBtn").click();
  await page.waitForTimeout(150);
  evidence.diagnostics = {
    errors: await page.locator(".ftbq-diagnostic.ERROR").count(),
    warnings: await page.locator(".ftbq-diagnostic.WARNING").count()
  };
  await page.locator("#closeDiagnosticsBtn").click();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    evidence.responsive.push(await page.evaluate((expected) => {
      const chapter = document.querySelector(".ftbq-chapter-panel").getBoundingClientRect();
      const questPanel = document.querySelector(".ftbq-quest-panel").getBoundingClientRect();
      return {
        viewport: expected,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        chapterPanel: { left: chapter.left, top: chapter.top, width: chapter.width, height: chapter.height },
        questPanel: { left: questPanel.left, top: questPanel.top, width: questPanel.width, height: questPanel.height },
        questButtons: document.querySelectorAll(".ftbq-quest-button").length
      };
    }, viewport));
  }

  const syntheticRoot = path.resolve("fixtures", "ftbquests-2101", "synthetic");
  await page.locator("#openQuestDirBtn").click();
  await page.locator("#pathInput").fill(syntheticRoot);
  await page.locator("#confirmPathBtn").click();
  await page.waitForFunction(() => document.querySelector("#statusText")?.textContent?.includes("Loaded"), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.locator('.ftbq-chapter-button[data-chapter-id="2222222222222222"]').click();
  await page.waitForTimeout(500);
  evidence.syntheticImage = {
    images: await page.locator(".ftbq-image-node").count(),
    loaded: await page.locator(".ftbq-image-node").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth > 0).length),
    screenshot: path.join(screenshotDir, "phase2b-chapter-image.png")
  };
  await page.screenshot({ path: evidence.syntheticImage.screenshot, fullPage: true });

  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
  if (consoleErrors.length > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  server.kill();
}
