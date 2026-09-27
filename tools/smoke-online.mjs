import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4500 + Math.floor(Math.random() * 500);
const basePath = "/ftb-quests-explorer/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const server = spawn(process.execPath, ["tools/preview-static.mjs"], {
  env: {
    ...process.env,
    PREVIEW_PORT: String(port),
    PREVIEW_BASE_PATH: basePath
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(new URL("demo/manifest.json", baseUrl));
      if (response.ok) return response.json();
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("static preview server did not start");
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
  await button.click();
  await page.waitForTimeout(250);
}

async function main() {
  const manifest = await waitForServer();
  const model = await (await fetch(new URL("demo/view-model.json", baseUrl))).json();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  const apiRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/")) apiRequests.push(request.url());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".ftbq-quest-button", { timeout: 20000 });
  await page.waitForTimeout(500);

  const firstQuest = model.quests.find((quest) => quest.tasks.length > 0 && quest.rewards.length > 0);
  const componentQuest = model.quests.find((quest) =>
    quest.tasks.some((task) => task.item?.components && Object.keys(task.item.components).length > 0)
    && quest.title?.plainText
    && !quest.title.missing
  );
  const targetQuest = componentQuest
    ?? model.quests.find((quest) => quest.title?.plainText && !quest.title.missing)
    ?? firstQuest;
  await selectChapter(page, targetQuest.chapterId);
  await page.locator(`.ftbq-quest-button[data-quest-id="${targetQuest.id}"]`).click();
  await page.waitForTimeout(250);

  const evidence = {
    baseUrl,
    basePath,
    manifest,
    readonlyBadge: await page.locator("#readonlyBadge").textContent(),
    demoInfo: await page.locator("#demoInfo").textContent(),
    chapters: await page.locator(".ftbq-chapter-button").count(),
    quests: await page.locator(".ftbq-quest-button").count(),
    detailVisible: await page.locator("#viewQuestPanel").isVisible(),
    title: await page.locator("#viewQuestTitle").textContent(),
    descriptionLength: (await page.locator(".ftbq-view-description").textContent()).length,
    search: null,
    diagnostics: null,
    components: targetQuest.tasks.some((task) => task.item?.components && Object.keys(task.item.components).length > 0),
    apiRequests,
    consoleErrors
  };

  await page.locator("#searchBtn").click();
  await page.locator("#searchInput").fill("forge_energy");
  await page.waitForTimeout(250);
  evidence.search = await page.locator("#searchResults .ftbq-list-entry").count();
  await page.locator("#closeSearchBtn").click();

  await page.locator("#diagnosticsBtn").click();
  await page.waitForTimeout(150);
  evidence.diagnostics = {
    errors: await page.locator(".ftbq-diagnostic.ERROR").count(),
    warnings: await page.locator(".ftbq-diagnostic.WARNING").count()
  };
  await page.locator("#closeDiagnosticsBtn").click();

  const link = model.questLinks[0];
  if (link) {
    await selectChapter(page, link.chapterId);
    await page.locator(`.ftbq-quest-link-button[data-quest-id="${link.targetId}"]`).click();
    await page.waitForTimeout(180);
    evidence.questLink = {
      linkId: link.id,
      targetId: link.targetId,
      selected: await page.locator(".ftbq-quest-button.selected").getAttribute("data-quest-id")
    };
  }

  const tableReward = model.rewards.find((reward) => reward.rewardTableId);
  if (tableReward) {
    const tableChapterId = model.quests.find((quest) => quest.id === tableReward.questId)?.chapterId;
    if (tableChapterId) await selectChapter(page, tableChapterId);
    await page.locator(`.ftbq-quest-button[data-quest-id="${tableReward.questId}"]`).click();
    await page.locator(`.ftbq-reward-button[data-reward-table-id="${tableReward.rewardTableId}"]`).first().click();
    await page.waitForTimeout(180);
    evidence.rewardTable = {
      tableId: tableReward.rewardTableId,
      dialogOpen: await page.locator("#rewardDialog").evaluate((dialog) => dialog.open)
    };
    await page.locator("#closeRewardBtn").click();
  }
  evidence.chapterImages = {
    count: model.images.length,
    broken: await page.locator(".ftbq-image-node").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length)
  };

  await page.screenshot({ path: "docs/phase2c-online-demo.png", fullPage: true });
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
  if (consoleErrors.length > 0) process.exitCode = 1;
  if (apiRequests.length > 0) process.exitCode = 1;
}

try {
  await main();
} finally {
  server.kill();
}
