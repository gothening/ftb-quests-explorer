import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { projectRoot } from "../helpers.mjs";

const port = 4400 + Math.floor(Math.random() * 200);

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until the child process has bound the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("dev server did not start");
}

test("read-only dev server exposes load and search APIs", async () => {
  const child = spawn(process.execPath, ["dev-server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl);

    const loadResponse = await fetch(`${baseUrl}/api/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "zh_cn" })
    });
    assert.equal(loadResponse.status, 200);
    const model = await loadResponse.json();
    assert.equal(model.readonly, true);
    assert.equal(model.chapters.length, 38);
    assert.equal(model.quests.length, 1914);
    assert.equal(model.tasks.length, 2356);
    assert.equal(model.rewards.length, 1335);

    const instanceResponse = await fetch(`${baseUrl}/api/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.resolve(projectRoot, ".."), locale: "zh_cn" })
    });
    assert.equal(instanceResponse.status, 200);
    assert.equal((await instanceResponse.json()).chapters.length, 38);

    const searchResponse = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "forge_energy", limit: 20 })
    });
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json();
    assert.equal(search.results.some((result) => result.kind === "task"), true);

    const staticResponse = await fetch(`${baseUrl}/`);
    assert.equal(staticResponse.status, 200);
    assert.equal((await staticResponse.text()).includes("PREVIEW / READ ONLY"), true);
  } finally {
    child.kill();
  }
});
