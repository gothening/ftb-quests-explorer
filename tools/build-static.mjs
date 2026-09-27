import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const frontendRoot = path.join(projectRoot, "frontend");
const sourceRoot = path.join(projectRoot, "src");
const demoRoot = path.join(projectRoot, "public", "demo");

function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside project: ${resolvedTarget}`);
  }
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(target) : fs.statSync(target).size;
  }
  return total;
}

assertInside(projectRoot, distRoot);
if (!fs.existsSync(demoRoot)) {
  throw new Error("Demo data is missing. Run npm run build:demo-data first.");
}

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });

for (const file of ["index.html", "style.css", "app.js"]) {
  fs.copyFileSync(path.join(frontendRoot, file), path.join(distRoot, file));
}
fs.cpSync(sourceRoot, path.join(distRoot, "src"), { recursive: true });
fs.cpSync(demoRoot, path.join(distRoot, "demo"), { recursive: true });

const indexPath = path.join(distRoot, "index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8")
  .replace('content="local"', 'content="online"');
fs.writeFileSync(indexPath, indexHtml, "utf8");
fs.copyFileSync(indexPath, path.join(distRoot, "404.html"));
fs.writeFileSync(path.join(distRoot, ".nojekyll"), "", "utf8");

const jsCssBytes = [
  "index.html",
  "style.css",
  "app.js"
].reduce((sum, file) => sum + fs.statSync(path.join(distRoot, file)).size, 0)
  + directorySize(path.join(distRoot, "src"));
const demoBytes = directorySize(path.join(distRoot, "demo"));
const totalBytes = directorySize(distRoot);

console.log(JSON.stringify({
  distRoot,
  jsCssBytes,
  demoBytes,
  totalBytes
}, null, 2));
