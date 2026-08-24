import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url);
const ignored = new Set([".git", "node_modules"]);
const files = await collect(root.pathname);
const forbidden = [
  ["private PEM", /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/],
  ["JWT-like credential", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ["npm access token", /npm_[A-Za-z0-9]{30,}/],
  ["GitHub token", /gh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}/],
  ["AWS access key id", /AKIA[0-9A-Z]{16}/],
  ["Convex deployment URL", /https:\/\/[a-z0-9-]+\.convex\.(?:cloud|site)/i],
];

for (const file of files) {
  if (/package-lock\.json$/.test(file)) continue;
  const text = await readFile(file, "utf8").catch(() => "");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(text)) {
      throw new Error(`${label} found in ${relative(root.pathname, file)}`);
    }
  }
}

const cache = await mkdtemp(join(tmpdir(), "una-sdk-npm-cache-"));
const packed = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--json"],
  {
    cwd: root.pathname,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
  },
);
await rm(cache, { recursive: true, force: true });
if (packed.status !== 0) {
  throw new Error(packed.stderr || packed.stdout || "npm pack failed");
}
const report = JSON.parse(packed.stdout)[0];
const packedFiles = report.files.map((entry) => entry.path);
const allowedPackagePaths = [
  "AGENT.md",
  "LICENSE",
  "README.md",
  "SKILL.md",
  "package.json",
];
for (const required of ["LICENSE", "README.md", "SKILL.md", "dist/index.js", "dist/index.d.ts"]) {
  if (!packedFiles.includes(required)) throw new Error(`Package is missing ${required}`);
}
for (const path of packedFiles) {
  if (
    !allowedPackagePaths.includes(path) &&
    !path.startsWith("dist/") &&
    !path.startsWith("examples/")
  ) {
    throw new Error(`Unexpected package entry: ${path}`);
  }
  if (/\.(?:map|jwk|env)$/.test(path) || path.includes("node_modules/")) {
    throw new Error(`Unsafe package entry: ${path}`);
  }
  const packedText = await readFile(join(root.pathname, path), "utf8").catch(
    () => "",
  );
  for (const [label, pattern] of forbidden) {
    if (pattern.test(packedText)) {
      throw new Error(`${label} found in packaged file ${path}`);
    }
  }
}

console.log(`Release audit passed: ${packedFiles.length} packaged files, no source maps or secret files.`);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
