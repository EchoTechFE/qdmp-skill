// Validates the planned release on a PR and the real Git tag during publication.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const primary = "skills/qdmp-skill";
const skillMetadata = ["qdmp-skill", "qdmp-design-rules", "qdmp-product-rules", "qdmp-entry-route"]
  .map(name => `skills/${name}/references/skill-release.json`);
const pluginManifests = ["codex", "claude", "qoder"].map(host => `.${host}-plugin/plugin.json`);
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function expectVersion(file, actual, expected) {
  if (actual !== expected) throw new Error(`${file} declares ${actual ?? "no version"}; expected ${expected}`);
}

export function checkReleaseVersion(repoRoot = root, tag) {
  const read = file => fs.readFileSync(path.join(repoRoot, file), "utf8");
  const json = file => JSON.parse(read(file));
  const declaration = json(skillMetadata[0]);
  const version = declaration.version;
  if (typeof version !== "string" || !stableVersion.test(version)) {
    throw new Error(`${skillMetadata[0]} must declare a stable X.Y.Z version`);
  }

  for (const file of [...skillMetadata.slice(1), ...pluginManifests]) {
    expectVersion(file, json(file).version, version);
  }
  if (Object.hasOwn(declaration, "plugin_version")) {
    expectVersion(`${skillMetadata[0]} plugin_version`, declaration.plugin_version, version);
  }

  const instructions = `${primary}/SKILL.md`;
  expectVersion(instructions, read(instructions).match(/--loaded-version\s+(\S+?)(?=`|\s|$)/)?.[1], version);
  const expectedTag = `v${version}`;
  const notes = `${primary}/references/release-notes.md`;
  expectVersion(notes, read(notes).split(/\r?\n/, 1)[0], `# QDMP Skill ${expectedTag}`);
  if (tag !== undefined) expectVersion("Git release tag", tag, expectedTag);
  return expectedTag;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("Usage: node scripts/check-release-version.mjs [vX.Y.Z]");
    const tag = checkReleaseVersion(root, process.argv[2]);
    console.log(`QDMP release ${tag} matches all four Skills and three plugin manifests.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
