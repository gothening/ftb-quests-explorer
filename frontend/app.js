import {
  ViewerState
} from "./src/viewer/viewer-state.js";
import {
  escapeHtml,
  plainMinecraftText,
  renderMinecraftText,
  setMissingTranslationDiagnostics
} from "./src/viewer/minecraft-text-renderer.js";
import {
  FTB_THEME,
  questOutlineColor
} from "./src/viewer/ftb-theme.js";
import {
  assetUrl,
  chapterIconUrl,
  configureResourceUrls,
  questIconUrl,
  rewardIconUrl,
  shapeAsset,
  taskIconUrl
} from "./src/viewer/resource-url.js";
import {
  computeChapterLayout,
  connectionPath,
  effectiveQuestShape,
  effectiveQuestSize
} from "./src/viewer/ftb-layout.js";

const el = {};
const collapsedGroups = new Set();
let viewerState = null;
let chapterFilter = "";
let currentLayout = null;
let referenceMenuType = null;
let viewerMode = "local";

document.addEventListener("DOMContentLoaded", init);

function init() {
  for (const id of [
    "bookIcon", "readonlyBadge", "demoInfo", "openInstanceBtn", "openQuestDirBtn", "reloadBtn", "searchBtn",
    "diagnosticsBtn", "mcVersion", "ftbqVersion", "chapterPanelTitle", "pinIcon",
    "searchIcon", "chapterFilter", "chapterTree", "questPanelTitle",
    "questPanelSubtitle", "fitBtn", "zoomOutBtn", "zoomRange", "zoomInBtn",
    "questViewport", "questWorld", "linkLayer", "imageLayer", "linkButtonLayer",
    "questLayer", "externalLayer", "tooltip", "questPanelStatus",
    "viewQuestPanel", "viewQuestIcon", "viewQuestTitle", "closeViewQuestBtn",
    "viewQuestContent", "statusText", "diagnosticsSummary", "pathDialog",
    "pathDialogTitle", "pathInput", "useCurrentBtn", "cancelPathBtn",
    "confirmPathBtn", "searchDialog", "searchInput", "searchResults",
    "closeSearchBtn", "diagnosticsDialog", "diagnosticsContent",
    "closeDiagnosticsBtn", "rewardDialog", "rewardDialogTitle",
    "rewardDialogContent", "closeRewardBtn"
  ]) {
    el[id] = document.getElementById(id);
  }

  viewerMode = resolveViewerMode();
  setMissingTranslationDiagnostics(
    new URLSearchParams(window.location.search).get("missingTranslations") === "1"
  );
  if (viewerMode === "online") {
    document.documentElement.classList.add("online-mode");
    el.readonlyBadge.textContent = "Online Demo / Read Only";
  }

  el.openInstanceBtn.addEventListener("click", () => openPathDialog("Open Instance", ""));
  el.openQuestDirBtn.addEventListener("click", () => openPathDialog(
    "Open Quest Directory",
    viewerState?.model?.metadata?.root ?? ""
  ));
  el.reloadBtn.addEventListener("click", () => {
    if (viewerMode === "online") loadOnlineDemo();
    else loadBook(viewerState?.model?.metadata?.root ?? "", "zh_cn", true);
  });
  el.useCurrentBtn.addEventListener("click", () => {
    el.pathDialog.close();
    loadBook("", "zh_cn", true);
  });
  el.cancelPathBtn.addEventListener("click", () => el.pathDialog.close());
  el.pathDialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = el.pathInput.value.trim();
    el.pathDialog.close();
    loadBook(value, "zh_cn", true);
  });

  el.chapterFilter.addEventListener("input", () => {
    chapterFilter = el.chapterFilter.value.trim().toLowerCase();
    renderChapterPanel();
  });
  el.fitBtn.addEventListener("click", fitQuestPanel);
  el.zoomOutBtn.addEventListener("click", () => {
    viewerState.__viewAdjusted = true;
    setZoom((viewerState?.zoom ?? 1) * 0.85);
  });
  el.zoomInBtn.addEventListener("click", () => {
    viewerState.__viewAdjusted = true;
    setZoom((viewerState?.zoom ?? 1) * 1.15);
  });
  el.zoomRange.addEventListener("input", () => {
    viewerState.__viewAdjusted = true;
    setZoom(Number(el.zoomRange.value) / 100);
  });
  el.searchBtn.addEventListener("click", openSearch);
  el.diagnosticsBtn.addEventListener("click", openDiagnostics);
  el.closeSearchBtn.addEventListener("click", () => el.searchDialog.close());
  el.closeDiagnosticsBtn.addEventListener("click", () => el.diagnosticsDialog.close());
  el.closeRewardBtn.addEventListener("click", () => {
    viewerState?.closeRewardTable();
    el.rewardDialog.close();
  });
  el.closeViewQuestBtn.addEventListener("click", () => {
    viewerState?.closeQuest();
    renderViewQuestPanel();
  });

  el.searchInput.addEventListener("input", () => viewerState?.setSearch(el.searchInput.value));
  el.questViewport.addEventListener("pointerdown", beginPan);
  el.questViewport.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("mouseover", handleTooltipOver);
  document.addEventListener("mouseout", handleTooltipOut);
  document.addEventListener("keydown", handleShortcut);
  document.addEventListener("click", handleDelegatedClick);
  window.addEventListener("resize", () => {
    if (!viewerState?.__viewAdjusted) fitQuestPanel();
    else applyTransform();
  });

  loadViewer();
}

function resolveViewerMode() {
  const queryMode = new URLSearchParams(window.location.search).get("mode");
  if (queryMode === "online" || queryMode === "local") return queryMode;
  return document.querySelector('meta[name="ftbq-mode"]')?.content === "online"
    ? "online"
    : "local";
}

async function loadViewer() {
  if (viewerMode === "online") {
    await loadOnlineDemo();
    return;
  }
  applyThemeAssets();
  await loadBook("");
}

function applyThemeAssets() {
  const squares = assetUrl("ftblibrary:textures/gui/background_squares.png");
  document.documentElement.style.setProperty("--ftbq-background-image", `url("${squares}")`);
  document.documentElement.style.setProperty("--chapter-panel-image", `url("${squares}")`);
  document.documentElement.style.setProperty("--quest-background-image", `url("${squares}")`);
  document.documentElement.style.setProperty("--quest-view-image", `url("${squares}")`);
  el.bookIcon.src = assetUrl("ftbquests:textures/item/book.png");
  el.pinIcon.src = assetUrl("ftbquests:textures/gui/pin.png");
  el.searchIcon.src = assetUrl("ftbquests:textures/gui/search.png");
  el.viewQuestIcon.src = assetUrl("ftbquests:textures/item/book.png");
}

async function loadBook(path, locale = "zh_cn", refresh = false) {
  setStatus(path ? `Loading ${path}` : "Loading current instance");
  try {
    const response = await fetch("/api/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, locale, refresh })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load quest book");
    attachViewerState(payload);
    setStatus(`Loaded ${payload.metadata.counts.quests} quests from ${payload.metadata.root}`);
  } catch (error) {
    setStatus(error.message, true);
    renderEmpty(error.message);
  }
}

async function loadOnlineDemo() {
  setStatus("Loading Online Demo");
  try {
    const demoBase = new URL("./demo/", document.baseURI).toString();
    const [manifestResponse, modelResponse, assetMapResponse] = await Promise.all([
      fetch(new URL("manifest.json", demoBase)),
      fetch(new URL("view-model.json", demoBase)),
      fetch(new URL("asset-map.json", demoBase))
    ]);
    if (!manifestResponse.ok || !modelResponse.ok || !assetMapResponse.ok) {
      throw new Error("Online Demo data is missing. Run npm run build:demo-data.");
    }
    const manifest = await manifestResponse.json();
    const model = await modelResponse.json();
    const assetMap = await assetMapResponse.json();
    configureResourceUrls({
      mode: "online",
      baseUrl: demoBase,
      assetMap: assetMap.assets ?? {},
      missing: assetMap.missing ?? "assets/missing.png"
    });
    applyThemeAssets();
    attachViewerState(model);
    el.demoInfo.hidden = false;
    el.demoInfo.textContent = `Demo ${manifest.generatedAt ?? ""} · ${manifest.sourceInstance ?? "unknown instance"}`;
    setStatus(`Online Demo loaded: ${model.metadata.counts.quests} quests`);
  } catch (error) {
    setStatus(error.message, true);
    renderEmpty(error.message);
  }
}

function attachViewerState(payload) {
  viewerState = new ViewerState(payload);
  viewerState.subscribe((state, reason) => {
    if (reason === "viewport") applyTransform();
    else if (reason === "search") renderSearchResults();
    else if (reason === "diagnostic") renderDiagnostics();
    else if (reason === "reward-table") renderRewardDialog();
    else {
      renderAll();
      if (reason === "chapter") fitQuestPanel();
    }
  });
  renderAll();
}

function openPathDialog(title, initialValue) {
  el.pathDialogTitle.textContent = title;
  el.pathInput.value = initialValue;
  el.pathDialog.showModal();
  el.pathInput.focus();
}

function openSearch() {
  el.searchDialog.showModal();
  el.searchInput.value = viewerState?.searchQuery ?? "";
  el.searchInput.focus();
  renderSearchResults();
}

function openDiagnostics() {
  el.diagnosticsDialog.showModal();
  renderDiagnostics();
}

function handleShortcut(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape") {
    if (el.searchDialog.open) el.searchDialog.close();
    if (el.diagnosticsDialog.open) el.diagnosticsDialog.close();
    if (el.rewardDialog.open) el.rewardDialog.close();
    if (!el.viewQuestPanel.hidden) viewerState?.closeQuest();
  }
  if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && document.activeElement === document.body) {
    fitQuestPanel();
  }
}

function handleDelegatedClick(event) {
  const closeView = event.target.closest("[data-close-view]");
  if (closeView) {
    viewerState?.closeQuest();
    renderViewQuestPanel();
    return;
  }

  const reference = event.target.closest("[data-reference]");
  if (reference) {
    referenceMenuType = reference.dataset.reference;
    renderViewQuestPanel();
    return;
  }

  const group = event.target.closest("[data-group-id]");
  if (group) {
    const groupId = group.dataset.groupId;
    if (collapsedGroups.has(groupId)) collapsedGroups.delete(groupId);
    else collapsedGroups.add(groupId);
    renderChapterPanel();
    return;
  }

  const questTarget = event.target.closest("[data-quest-id]");
  if (questTarget) {
    const questId = questTarget.dataset.questId;
    if (questId && viewerState?.selectQuest(questId)) {
      referenceMenuType = null;
      if (el.searchDialog.open) el.searchDialog.close();
      renderViewQuestPanel();
    }
    return;
  }

  const chapterTarget = event.target.closest("[data-chapter-id]");
  if (chapterTarget) {
    viewerState?.selectChapter(chapterTarget.dataset.chapterId);
    return;
  }

  const tableTarget = event.target.closest("[data-reward-table-id]");
  if (tableTarget) {
    el.rewardDialog.showModal();
    viewerState?.openRewardTable(tableTarget.dataset.rewardTableId);
    return;
  }

  const diagnosticTarget = event.target.closest("[data-diagnostic]");
  if (diagnosticTarget) {
    try {
      viewerState?.selectDiagnostic(JSON.parse(diagnosticTarget.dataset.diagnostic));
      el.diagnosticsDialog.close();
    } catch {
      // Ignore malformed diagnostic metadata.
    }
  }
}

function renderAll() {
  if (!viewerState) return;
  renderHeader();
  renderChapterPanel();
  renderQuestPanel();
  renderViewQuestPanel();
  renderDiagnosticsSummary();
  renderDiagnostics();
  renderRewardDialog();
  if (!viewerState.__initialFitDone) {
    viewerState.__initialFitDone = true;
    fitQuestPanel();
  }
}

function renderHeader() {
  const metadata = viewerState.model.metadata;
  el.mcVersion.textContent = `Minecraft ${metadata.minecraftVersion ?? "1.21.1"}`;
  el.ftbqVersion.textContent = metadata.ftbQuestsVersion
    ? `FTB Quests ${metadata.ftbQuestsVersion}`
    : "FTB Quests 2101.1.x";
  el.chapterPanelTitle.textContent = "Quest Book";
}

function renderChapterPanel() {
  if (!viewerState) return;
  const model = viewerState.model;
  const chapterMap = new Map(model.chapters.map((chapter) => [chapter.id, chapter]));
  const query = chapterFilter;
  el.chapterTree.textContent = "";

  for (const group of model.groups) {
    const chapters = group.chapterIds
      .map((id) => chapterMap.get(id))
      .filter(Boolean)
      .filter((chapter) => {
        if (!query) return true;
        return `${plainMinecraftText(chapter.title)} ${chapter.id} ${chapter.filename}`.toLowerCase().includes(query);
      });
    if (query && chapters.length === 0) continue;

    const collapsed = !query && collapsedGroups.has(group.id);
    const groupButton = document.createElement("button");
    groupButton.type = "button";
    groupButton.className = "ftbq-group-button";
    groupButton.dataset.groupId = group.id;
    groupButton.innerHTML = `
      <img class="ftbq-group-arrow" src="${escapeHtml(assetUrl(collapsed
        ? "ftbquests:textures/gui/arrow_collapsed.png"
        : "ftbquests:textures/gui/arrow_expanded.png"))}" alt="">
      <span class="ftbq-group-title"></span>
    `;
    groupButton.querySelector(".ftbq-group-title").innerHTML = group.ungrouped
      ? "Ungrouped"
      : renderTextValue(group.title) || group.id;
    el.chapterTree.append(groupButton);

    if (collapsed) continue;
    const list = document.createElement("div");
    for (const chapter of chapters) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ftbq-chapter-button${chapter.id === viewerState.currentChapterId ? " active" : ""}`;
      button.dataset.chapterId = chapter.id;
      button.innerHTML = `
        <img class="ftbq-chapter-icon" src="${escapeHtml(chapterIconUrl(chapter))}" alt="">
        <span class="ftbq-chapter-title"></span>
        <span class="ftbq-chapter-count">${chapter.questCount}</span>
      `;
      button.querySelector(".ftbq-chapter-title").innerHTML = renderTextValue(chapter.title) || chapter.id;
      list.append(button);
    }
    el.chapterTree.append(list);
  }

  requestAnimationFrame(() => {
    el.chapterTree.querySelector(".ftbq-chapter-button.active")?.scrollIntoView({ block: "nearest" });
  });
}

function renderQuestPanel() {
  for (const layer of [el.linkLayer, el.imageLayer, el.linkButtonLayer, el.questLayer, el.externalLayer]) {
    layer.textContent = "";
  }

  const chapter = viewerState?.currentChapter;
  if (!chapter) {
    el.questPanelStatus.textContent = "No chapter selected";
    return;
  }

  const quests = viewerState.visibleQuests;
  const images = viewerState.model.images.filter((image) => image.chapterId === chapter.id);
  const links = viewerState.model.questLinks.filter((link) => link.chapterId === chapter.id);
  currentLayout = computeChapterLayout({ quests, images, links, chapter });

  const worldWidth = currentLayout.worldWidth;
  const worldHeight = currentLayout.worldHeight;
  el.questWorld.style.width = `${worldWidth}px`;
  el.questWorld.style.height = `${worldHeight}px`;
  for (const layer of [el.linkLayer, el.imageLayer, el.linkButtonLayer, el.questLayer, el.externalLayer]) {
    layer.style.width = `${worldWidth}px`;
    layer.style.height = `${worldHeight}px`;
  }

  renderChapterImages(images);
  renderQuestLinks(links);
  renderConnections(quests);
  renderQuestNodes(quests);
  renderExternalDependencies(quests);

  el.questPanelTitle.innerHTML = renderTextValue(chapter.title) || chapter.id;
  el.questPanelSubtitle.textContent = `${quests.length} quests · ${images.length} images · ${links.length} links`;
  el.questPanelStatus.textContent = `${plainMinecraftText(chapter.title) || chapter.id} · ${quests.length} quests`;
  applyTransform();
}

function renderChapterImages(images) {
  for (const image of images) {
    const position = currentLayout.imagePositions.get(image.id);
    if (!position) continue;
    const node = document.createElement("img");
    node.className = "ftbq-image-node";
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.style.width = `${position.width}px`;
    node.style.height = `${position.height}px`;
    node.style.opacity = String(Math.max(0, Math.min(1, Number(image.alpha ?? 255) / 255)));
    node.style.transform = `rotate(${Number(image.rotation ?? 0)}deg)`;
    node.src = assetUrl(image.image);
    node.alt = "";
    node.addEventListener("error", () => {
      node.classList.add("missing");
      node.src = assetUrl("ftbquests:textures/gui/hidden.png");
    }, { once: true });
    el.imageLayer.append(node);
  }
}

function renderQuestLinks(links) {
  for (const link of links) {
    const position = currentLayout.linkPositions.get(link.id);
    if (!position) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ftbq-quest-link-button";
    button.dataset.questId = link.targetId;
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.style.width = `${position.width}px`;
    button.style.height = `${position.height}px`;
    button.innerHTML = `<img src="${escapeHtml(assetUrl("ftbquests:textures/gui/link.png"))}" alt="">`;
    button.dataset.tooltip = tooltipJson({
      title: link.targetTitle ?? link.targetId,
      meta: ["Quest Link", link.targetId]
    });
    el.linkButtonLayer.append(button);
  }
}

function renderConnections(quests) {
  const positions = currentLayout.questPositions;
  const visible = new Map(quests.map((quest) => [quest.id, quest]));
  const selected = viewerState.selectedQuest;

  for (const edge of viewerState.model.edges) {
    const dependency = visible.get(edge.to);
    const dependent = visible.get(edge.from);
    if (!dependency || !dependent) continue;
    const start = positions.get(edge.to);
    const end = positions.get(edge.from);
    if (!start || !end) continue;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", connectionPath(start, end, dependent, edge.to, currentLayout));
    const classes = ["ftbq-dependency"];
    if (edge.crossChapter) classes.push("cross-chapter");
    if (!edge.toChapterId) classes.push("missing");
    if (selected?.id === edge.from) classes.push("requires");
    if (selected?.id === edge.to) classes.push("required-for");
    path.setAttribute("class", classes.join(" "));
    el.linkLayer.append(path);
  }
}

function renderQuestNodes(quests) {
  for (const quest of quests) {
    const position = currentLayout.questPositions.get(quest.id);
    if (!position) continue;

    const shape = effectiveQuestShape(quest, viewerState.currentChapter);
    const size = effectiveQuestSize(quest, viewerState.currentChapter);
    const iconSize = Math.max(10, Math.round(position.width * (2 / 3)));
    const missing = quest.dependencies.some((dependency) => !dependency.exists);
    const hidden = Boolean(quest.visibility?.invisible);
    const node = document.createElement("div");
    node.className = `ftbq-quest-button${quest.id === viewerState.selectedQuestId ? " selected" : ""}${missing ? " missing" : ""}${hidden ? " locked" : ""}`;
    node.dataset.questId = quest.id;
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.style.width = `${position.width}px`;
    node.style.height = `${position.height}px`;
    node.style.setProperty("--quest-outline", questOutlineColor(quest));
    node.dataset.tooltip = tooltipJson(questTooltip(quest));

    const shapeName = shape === "none" ? "square" : shape;
    node.innerHTML = `
      <span class="ftbq-shape-layer ftbq-shape-base" style="mask-image:url('${escapeHtml(shapeAsset(shapeName, "shape"))}');-webkit-mask-image:url('${escapeHtml(shapeAsset(shapeName, "shape"))}')"></span>
      <span class="ftbq-shape-layer ftbq-shape-background" style="mask-image:url('${escapeHtml(shapeAsset(shapeName, "background"))}');-webkit-mask-image:url('${escapeHtml(shapeAsset(shapeName, "background"))}')"></span>
      <span class="ftbq-shape-layer ftbq-shape-outline" style="mask-image:url('${escapeHtml(shapeAsset(shapeName, "outline"))}');-webkit-mask-image:url('${escapeHtml(shapeAsset(shapeName, "outline"))}')"></span>
      <img class="ftbq-quest-icon" src="${escapeHtml(questIconUrl(quest))}" alt="" style="width:${iconSize}px;height:${iconSize}px">
      ${missing || hidden ? `<img class="ftbq-status-icon" src="${escapeHtml(assetUrl("ftbquests:textures/gui/quest_locked.png"))}" alt="">` : ""}
      ${quest.settings?.optional ? '<span class="ftbq-optional-badge">*</span>' : ""}
    `;
    node.querySelector(".ftbq-quest-icon")?.addEventListener("error", (event) => {
      event.currentTarget.src = assetUrl("ftbquests:textures/gui/quest_locked.png");
    }, { once: true });
    el.questLayer.append(node);
  }
}

function renderExternalDependencies(quests) {
  const selected = viewerState.selectedQuest;
  if (!selected) return;
  const visible = new Map(quests.map((quest) => [quest.id, quest]));
  const external = new Map();
  for (const edge of viewerState.model.edges) {
    if (edge.from !== selected.id && edge.to !== selected.id) continue;
    const otherId = edge.from === selected.id ? edge.to : edge.from;
    if (!visible.has(otherId)) external.set(otherId, edge);
  }

  let index = 0;
  const externalPositions = new Map();
  for (const id of external.keys()) {
    const target = viewerState.model.quests.find((quest) => quest.id === id);
    const node = document.createElement("button");
    node.type = "button";
    node.className = `ftbq-external-node${target ? "" : " missing"}`;
    node.dataset.questId = id;
    const nodeX = Math.max(4, currentLayout.worldWidth - 178);
    const nodeY = 12 + index * 20;
    node.style.left = `${nodeX}px`;
    node.style.top = `${nodeY}px`;
    node.textContent = target
      ? `↔ ${plainMinecraftText(target.title) || id}`
      : `Missing ${id}`;
    node.dataset.tooltip = tooltipJson({
      title: target ? plainMinecraftText(target.title) : id,
      meta: [target?.chapterId ? `Chapter ${target.chapterId}` : "Missing dependency"]
    });
    el.externalLayer.append(node);
    const rect = { x: nodeX, y: nodeY, width: 172, height: 17 };
    externalPositions.set(id, {
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2
    });
    index++;
  }

  const selectedPosition = currentLayout.questPositions.get(selected.id);
  if (!selectedPosition) return;
  for (const [id, edge] of external.entries()) {
    const end = externalPositions.get(id);
    if (!end) continue;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${selectedPosition.centerX} ${selectedPosition.centerY} L ${end.centerX} ${end.centerY}`);
    path.setAttribute("class", `ftbq-dependency cross-chapter${edge.toChapterId ? "" : " missing"}`);
    el.linkLayer.append(path);
  }
}

function questTooltip(quest) {
  const meta = [
    quest.id,
    `${quest.tasks.length} tasks`,
    `${quest.rewards.length} rewards`,
    quest.settings?.optional ? "optional" : ""
  ].filter(Boolean);
  return { title: quest.title ?? quest.id, subtitle: quest.subtitle, meta };
}

function tooltipJson(data) {
  return escapeHtml(JSON.stringify(data));
}

function renderTextValue(value) {
  if (value && typeof value === "object") return renderMinecraftText(value);
  return escapeHtml(value ?? "");
}

function handleTooltipOver(event) {
  const target = event.target.closest("[data-tooltip]");
  if (!target) return;
  try {
    const data = JSON.parse(target.dataset.tooltip);
    el.tooltip.innerHTML = `
      <div class="tooltip-title">${renderTextValue(data.title)}</div>
      ${data.subtitle ? `<div class="tooltip-subtitle">${renderTextValue(data.subtitle)}</div>` : ""}
      ${(data.meta ?? []).map((line) => `<div class="tooltip-meta">${escapeHtml(line)}</div>`).join("")}
      ${data.item ? `<div class="tooltip-item">${escapeHtml(data.item)}</div>` : ""}
    `;
    const viewportRect = el.questViewport.getBoundingClientRect();
    el.tooltip.style.left = `${Math.max(0, Math.min(viewportRect.width - 220, event.clientX - viewportRect.left + 12))}px`;
    el.tooltip.style.top = `${Math.max(0, Math.min(viewportRect.height - 80, event.clientY - viewportRect.top + 12))}px`;
    el.tooltip.hidden = false;
  } catch {
    el.tooltip.hidden = true;
  }
}

function handleTooltipOut(event) {
  if (!event.relatedTarget?.closest?.("[data-tooltip]")) el.tooltip.hidden = true;
}

function renderViewQuestPanel() {
  const quest = viewerState?.selectedQuest;
  if (!quest) {
    el.viewQuestPanel.hidden = true;
    return;
  }

  el.viewQuestPanel.hidden = false;
  el.viewQuestIcon.src = questIconUrl(quest);
  el.viewQuestTitle.innerHTML = renderMinecraftText(quest.title) || quest.id;

  const tasks = quest.tasks.length > 0
    ? quest.tasks.map(renderTaskButton).join("")
    : '<span class="ftbq-list-match">No tasks</span>';
  const rewards = quest.rewards.length > 0
    ? quest.rewards.map(renderRewardButton).join("")
    : '<span class="ftbq-list-match">No rewards</span>';
  const links = viewerState.model.questLinks.filter((link) => link.targetId === quest.id);
  const linkButtons = links.map((link) => `
    <button type="button" data-quest-id="${escapeHtml(link.targetId)}">
      ${escapeHtml(link.targetTitle ? plainMinecraftText(link.targetTitle) : link.targetId)}
    </button>
  `).join("");

  el.viewQuestContent.innerHTML = `
    <div class="ftbq-view-split">
      <section>
        <div class="ftbq-view-section-title tasks">Tasks</div>
        <div class="ftbq-icon-grid">${tasks}</div>
      </section>
      <div class="ftbq-view-divider"></div>
      <section>
        <div class="ftbq-view-section-title rewards">Rewards</div>
        <div class="ftbq-icon-grid">${rewards}</div>
      </section>
    </div>
    ${quest.subtitle ? `<div class="ftbq-view-subtitle">${renderMinecraftText(quest.subtitle)}</div>` : ""}
    <div class="ftbq-view-description">${renderMinecraftText(quest.description) || '<span class="ftbq-list-match">No description</span>'}</div>
    ${linkButtons ? `<div class="ftbq-link-list">${linkButtons}</div>` : ""}
    <details class="ftbq-raw-details">
      <summary>Raw data</summary>
      <pre>${escapeHtml(JSON.stringify({
        id: quest.id,
        sourceFile: quest.sourceFile,
        unknownFields: quest.unknownFields,
        tasks: quest.tasks.map((task) => ({
          id: task.id,
          type: task.type,
          unknownFields: task.unknownFields,
          data: task.data
        })),
        rewards: quest.rewards.map((reward) => ({
          id: reward.id,
          type: reward.type,
          unknownFields: reward.unknownFields,
          data: reward.data
        }))
      }, null, 2))}</pre>
    </details>
    <div class="ftbq-view-footer">
      <button type="button" data-reference="dependencies">◀ Dependencies (${quest.dependencies.length})</button>
      <div class="ftbq-list-match">${escapeHtml(quest.id)}</div>
      <button type="button" data-reference="dependents">Dependents (${quest.dependents.length}) ▶</button>
    </div>
    <div id="referenceMenu" class="ftbq-reference-menu" hidden></div>
  `;

  const icon = el.viewQuestIcon;
  icon.onerror = () => { icon.src = assetUrl("ftbquests:textures/gui/quest_locked.png"); };

  if (referenceMenuType) renderReferenceMenu(quest, referenceMenuType);
}

function renderReferenceMenu(quest, type) {
  const menu = document.getElementById("referenceMenu");
  if (!menu) return;
  const items = type === "dependencies" ? quest.dependencies : quest.dependents;
  if (items.length === 0) {
    menu.innerHTML = `<div class="ftbq-list-match">None</div>`;
    menu.hidden = false;
    return;
  }
  menu.innerHTML = items.map((item) => `
    <button type="button" data-quest-id="${escapeHtml(item.id)}">
      ${item.exists === false ? "Missing: " : ""}${escapeHtml(item.title ? plainMinecraftText(item.title) : item.id)}
    </button>
  `).join("");
  menu.hidden = false;
}

function renderTaskButton(task) {
  const count = task.item?.count ?? task.data?.count ?? task.data?.value;
  const tooltip = {
    title: task.title ?? task.displayName ?? task.type,
    meta: [
      task.id,
      task.type,
      task.optional ? "optional" : "",
      task.item?.id ? `item: ${task.item.id}` : ""
    ].filter(Boolean),
    item: task.item?.components && Object.keys(task.item.components).length > 0
      ? `components: ${Object.keys(task.item.components).length}`
      : ""
  };
  return `
    <button type="button" class="ftbq-task-button" data-task-id="${escapeHtml(task.id)}" data-tooltip="${tooltipJson(tooltip)}">
      <img src="${escapeHtml(taskIconUrl(task))}" alt="">
      ${count != null && count !== 1 ? `<span class="ftbq-item-count">${escapeHtml(String(count))}</span>` : ""}
      ${task.optional ? '<span class="ftbq-optional-task">*</span>' : ""}
    </button>
  `;
}

function renderRewardButton(reward) {
  const count = reward.item?.count ?? reward.data?.xp ?? reward.data?.xp_levels;
  const tooltip = {
    title: reward.title ?? reward.displayName ?? reward.type,
    meta: [
      reward.id,
      reward.type,
      reward.item?.id ? `item: ${reward.item.id}` : "",
      reward.rewardTableId ? `table: ${reward.rewardTableId}` : ""
    ].filter(Boolean)
  };
  return `
    <button type="button" class="ftbq-reward-button"
      data-reward-id="${escapeHtml(reward.id)}"
      ${reward.rewardTableId ? `data-reward-table-id="${escapeHtml(reward.rewardTableId)}"` : ""}
      data-tooltip="${tooltipJson(tooltip)}">
      <img src="${escapeHtml(rewardIconUrl(reward))}" alt="">
      ${count != null && count !== 1 ? `<span class="ftbq-item-count">${escapeHtml(String(count))}</span>` : ""}
    </button>
  `;
}

function renderDiagnosticsSummary() {
  const diagnostics = viewerState?.diagnostics;
  if (!diagnostics) return;
  el.diagnosticsSummary.textContent = `ERROR ${diagnostics.errors.length} / WARNING ${diagnostics.warnings.length} / INFO ${diagnostics.infos.length}`;
}

function renderDiagnostics() {
  if (!viewerState || !el.diagnosticsDialog.open) return;
  const diagnostics = viewerState.diagnostics;
  const groups = [
    ["ERROR", diagnostics.errors],
    ["WARNING", diagnostics.warnings],
    ["INFO", diagnostics.infos]
  ];
  el.diagnosticsContent.innerHTML = groups.map(([severity, issues]) => {
    if (issues.length === 0) return "";
    return `
      <section>
        <h3>${severity}</h3>
        ${issues.map((issue) => `
          <div class="ftbq-list-entry ftbq-diagnostic ${severity}" data-diagnostic='${escapeHtml(JSON.stringify(issue))}'>
            <div class="ftbq-list-kind">${escapeHtml(issue.code)}</div>
            <div class="ftbq-list-match">${escapeHtml(issue.message)}</div>
          </div>
        `).join("")}
      </section>
    `;
  }).join("");
}

function renderSearchResults() {
  if (!viewerState || !el.searchDialog.open) return;
  const results = viewerState.searchResults;
  if (!viewerState.searchQuery.trim()) {
    el.searchResults.innerHTML = '<p class="ftbq-list-match">输入关键词搜索章节、Quest、Task、Reward、Item、翻译。</p>';
    return;
  }
  if (results.length === 0) {
    el.searchResults.innerHTML = '<p class="ftbq-list-match">No results</p>';
    return;
  }
  el.searchResults.innerHTML = results.map((result) => `
    <div class="ftbq-list-entry"
      data-quest-id="${result.questId ? escapeHtml(result.questId) : ""}"
      data-chapter-id="${result.chapterId ? escapeHtml(result.chapterId) : ""}">
      <div class="ftbq-list-kind">${escapeHtml(result.kind)}</div>
      <div class="ftbq-list-match">${escapeHtml(result.label)}<br><span>${escapeHtml(result.match)}</span></div>
    </div>
  `).join("");
}

function renderRewardDialog() {
  if (!viewerState || !el.rewardDialog.open) return;
  const table = viewerState.selectedRewardTable;
  if (!table) {
    el.rewardDialogTitle.textContent = "Reward Table";
    el.rewardDialogContent.innerHTML = '<p class="ftbq-list-match">No reward table selected.</p>';
    return;
  }
  el.rewardDialogTitle.textContent = plainMinecraftText(table.title) || table.id;
  el.rewardDialogContent.innerHTML = `
    <div class="ftbq-list-entry"><div class="ftbq-list-kind">ID</div><div class="ftbq-list-match">${escapeHtml(table.id)}</div></div>
    <div class="ftbq-list-entry"><div class="ftbq-list-kind">Loot Size</div><div class="ftbq-list-match">${Number(table.lootSize ?? 1)}</div></div>
    ${table.entries.map((entry) => `
      <div class="ftbq-list-entry">
        <div class="ftbq-list-kind">weight ${Number(entry.weight ?? 1)}</div>
        <div class="ftbq-list-match">
          ${entry.reward.item ? escapeHtml(entry.reward.item.id) : escapeHtml(entry.reward.displayName ?? entry.reward.type)}
          ${entry.reward.item?.count ? ` × ${entry.reward.item.count}` : ""}
        </div>
      </div>
    `).join("")}
  `;
}

function setZoom(value) {
  viewerState?.setZoom(value);
}

function applyTransform() {
  if (!viewerState) return;
  el.questWorld.style.transform = `translate(${viewerState.pan.x}px, ${viewerState.pan.y}px) scale(${viewerState.zoom})`;
  el.zoomRange.value = Math.round(viewerState.zoom * 100);
}

function fitQuestPanel() {
  if (!viewerState || !currentLayout) return;
  viewerState.__viewAdjusted = false;
  const width = Math.max(1, el.questViewport.clientWidth);
  const height = Math.max(1, el.questViewport.clientHeight);
  const zoom = Math.min(
    1.75,
    Math.max(0.25, Math.min(
      (width - 24) / currentLayout.worldWidth,
      (height - 24) / currentLayout.worldHeight
    ) * 0.98)
  );
  viewerState.setZoom(zoom);
  viewerState.setPan(
    (width - currentLayout.worldWidth * zoom) / 2,
    (height - currentLayout.worldHeight * zoom) / 2
  );
}

function beginPan(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".ftbq-quest-button, .ftbq-image-node, .ftbq-quest-link-button, .ftbq-external-node, button")) return;
  el.questViewport.classList.add("dragging");
  const start = { x: event.clientX, y: event.clientY };
  const origin = { ...viewerState.pan };
  const move = (moveEvent) => {
    viewerState.__viewAdjusted = true;
    viewerState.setPan(
      origin.x + moveEvent.clientX - start.x,
      origin.y + moveEvent.clientY - start.y
    );
  };
  const up = () => {
    el.questViewport.classList.remove("dragging");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function handleWheel(event) {
  if (!viewerState) return;
  viewerState.__viewAdjusted = true;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const delta = -event.deltaY * 0.002;
    viewerState.setZoom(viewerState.zoom * (1 + delta));
  } else {
    event.preventDefault();
    viewerState.setPan(
      viewerState.pan.x - event.deltaX,
      viewerState.pan.y - event.deltaY
    );
  }
}

function renderEmpty(message) {
  el.chapterTree.innerHTML = `<p class="ftbq-list-match">${escapeHtml(message)}</p>`;
  el.questLayer.innerHTML = "";
  el.questPanelStatus.textContent = message;
}

function setStatus(message, error = false) {
  el.statusText.textContent = message;
  el.statusText.style.color = error ? FTB_THEME.colors.danger : FTB_THEME.colors.text;
}
