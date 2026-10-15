import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { distributionFile, checkDistribution } from "../scripts/check-telemetry-distribution.mjs";

const source = fs.readFileSync(distributionFile, "utf8");
const skillDirectory = fileURLToPath(new URL("../skills/qdmp-skill/", import.meta.url));
const checker = fileURLToPath(new URL("../scripts/check-telemetry-distribution.mjs", import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-distribution-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "skills", "qdmp-skill", "references", "telemetry-distribution.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return { root, file };
}

test("release manifest is bundled and standalone Skill resolves its own manifest", (t) => {
  checkDistribution();
  assert.equal(fs.existsSync(new URL("../telemetry-distribution.json", import.meta.url)), false, "do not reintroduce a second repository manifest");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-skill-packaging-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const installed = path.join(temporary, "qoder skills", "qdmp-skill");
  fs.cpSync(skillDirectory, installed, { recursive: true });
  const reference = fs.readFileSync(path.join(installed, "references/skill-data-consent.md"), "utf8");
  const link = reference.match(/\[telemetry-distribution\.json\]\(([^)]+)\)/);
  assert.ok(link, "consent reference must link its bundled manifest");
  const resolved = path.resolve(installed, "references", link[1]);
  assert.equal(resolved, path.join(installed, "references/telemetry-distribution.json"));
  assert.equal(fs.readFileSync(resolved, "utf8"), source);
  assert.deepEqual(checkDistribution(resolved), JSON.parse(source));
  assert.equal(fs.existsSync(path.join(temporary, "telemetry-distribution.json")), false);
});

test("canonical manifest is required; a legacy root copy is never used or regenerated", (t) => {
  const { root, file } = fixture(t);
  fs.writeFileSync(path.join(root, "telemetry-distribution.json"), source);
  assert.throws(() => checkDistribution(file), { code: "ENOENT" });
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, "{}");
  assert.throws(() => checkDistribution(file), /incomplete or invalid/);
  assert.equal(fs.readFileSync(file, "utf8"), "{}");
});

test("validation is read-only and creates no second manifest", (t) => {
  const { root, file } = fixture(t);
  fs.writeFileSync(file, source);
  const before = fs.statSync(file).mtimeMs;
  assert.deepEqual(checkDistribution(file), JSON.parse(source));
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.equal(fs.readFileSync(file, "utf8"), source);
  assert.deepEqual(fs.readdirSync(root), ["skills"]);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["telemetry-distribution.json"]);
});

test("CLI resolves the Skill manifest independently of the caller workspace", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, "telemetry-distribution.json"), "not a trusted manifest");
  const run = (...args) => spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: "utf8" });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /read-only check/);
  assert.equal(run("--unknown").status, 1);
  assert.equal(fs.readFileSync(path.join(root, "telemetry-distribution.json"), "utf8"), "not a trusted manifest");
});

test("release gate rejects unavailable onboarding, unsafe URLs, hash/version mismatch and internal repository metadata", (t) => {
  const { file } = fixture(t);
  const manifest = JSON.parse(source);
  const variants = [
    { ...manifest, onboarding: null },
    { ...manifest, artifact_url: "http://example.com/package.tar.gz" },
    { ...manifest, artifact_sha256: "invalid" },
    { ...manifest, onboarding: { ...manifest.onboarding, version: "0.0.0" } },
    { ...manifest, onboarding: { ...manifest.onboarding, sha256: "invalid" } },
    { ...manifest, repository_source: "https://internal.example/repo" }
  ];
  for (const variant of variants) {
    const invalid = JSON.stringify(variant);
    fs.writeFileSync(file, invalid);
    assert.throws(() => checkDistribution(file), /incomplete or invalid/);
    assert.equal(fs.readFileSync(file, "utf8"), invalid);
  }
});

test("offline notice must match the released artifacts and unchanged legal text", (t) => {
  const { file } = fixture(t);
  const manifest = JSON.parse(source);
  for (const notice of [null,
    { ...manifest.pre_download_notice, version: "0.0.0" },
    { ...manifest.pre_download_notice, artifact_sha256: "f".repeat(64) },
    { ...manifest.pre_download_notice, onboarding_sha256: "f".repeat(64) },
    { ...manifest.pre_download_notice, legal: "shortened" },
    { ...manifest.pre_download_notice, permitted_action: "update" }
  ]) {
    const invalid = JSON.stringify({ ...manifest, pre_download_notice: notice });
    fs.writeFileSync(file, invalid);
    assert.throws(() => checkDistribution(file), /pre-download notice/);
    assert.equal(fs.readFileSync(file, "utf8"), invalid);
  }
});
