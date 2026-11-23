import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkReleaseVersion } from "../scripts/check-release-version.mjs";
import { recoverPending } from "../skills/qdmp-skill/scripts/recover-update.mjs";
import { ensureCurrent, auditInstallation, flowCompatibility, compare, main, latestRelease, hostInvocation, releaseHighlights } from "../skills/qdmp-skill/scripts/ensure-current.mjs";

const names = ["qdmp-skill", "qdmp-design-rules", "qdmp-product-rules", "qdmp-entry-route"];
const latest = { version: "1.1.13", tag: "v1.1.13" };
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
function save(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data)); }
function skill(root, name, version = "1.1.11") {
  save(path.join(root, "SKILL.md"), `---\nname: ${name}\ndescription: fixture\n---\n${version}\n`);
  if (version) save(path.join(root, "references/skill-release.json"), { schema_version: 1, repository: "EchoTechFE/qdmp-skill", version });
  if (name === "qdmp-skill") {
    save(path.join(root, "references/telemetry-distribution.json"), { version: version === latest.version ? "0.2.17" : "0.2.14", onboarding: { sha256: hash("new entry") } });
  }
}
function fixture(t, host = "codex", platform = "darwin") {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-recovery-test-")));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const config = path.join(home, { codex: ".codex", "claude-code": ".claude", qoder: ".qoder" }[host]);
  const cwd = path.join(home, "项目 空格 & $x"); fs.mkdirSync(cwd);
  const personal = path.join(config, "skills/qdmp-skill"); skill(personal, "qdmp-skill");
  const source = path.join(home, "release");
  for (const manifest of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) save(path.join(source, manifest, "plugin.json"), { name: "qdmp", version: latest.version });
  for (const name of names) skill(path.join(source, "skills", name), name, latest.version);
  let row = null, fail = false, commandVersion = latest.version, tamper = false;
  const calls = [];
  const options = { homeDir: home, env: {}, platform, hostCommand: `fixture-${host}`, latestRelease: async () => latest,
    checkout: () => ({ root: source }), commandResult(exe, args, opts) {
      calls.push({ exe, args, timeout: opts.timeout });
      assert.equal(exe, `fixture-${host}`, "must not use another IDE's CLI");
      assert.equal(opts.cwd, cwd);
      if (args[1] === "list") { assert.equal(args.includes("--marketplace"), host === "codex"); return { installed: row ? [row] : [] }; }
      if (args[1] === "marketplace" && args[2] === "list") return { marketplaces: [{ name: "qdmp-marketplace", root: source }] };
      if (args.includes("--help")) return args[1] === "marketplace" ? host === "codex" ? "upgrade" : "update" : host === "codex" ? "add list marketplace" : "update list marketplace";
      if (args[1] === "marketplace") { assert.equal(args.at(-1), "qdmp-marketplace"); assert.equal(args[2], host === "codex" ? "upgrade" : "update"); return "ok"; }
      assert.equal(args[2], "qdmp@qdmp-marketplace");
      if (args[1] === "remove") {
        assert.equal(host, "codex");
        fs.rmSync(row.installedPath, { recursive: true });
        row = null;
        return "ok";
      }
      if (args[1] === "disable") {
        assert.equal(host === "claude-code" ? args.at(-1) : args.length, host === "claude-code" ? "user" : 3);
        row = { ...row, enabled: false };
        return "ok";
      }
      if (fail) throw new Error("fixture update timed out");
      const root = path.join(config, "plugins/cache/qdmp-marketplace/qdmp", commandVersion);
      fs.cpSync(source, root, { recursive: true });
      if (commandVersion !== latest.version) for (const manifest of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) save(path.join(root, manifest, "plugin.json"), { name: "qdmp", version: commandVersion });
      if (tamper) save(path.join(root, "skills/qdmp-skill/SKILL.md"), "wrong cached content");
      row = { ...row, version: commandVersion, installedPath: root }; return "ok";
    } };
  return { home, config, cwd, personal, source, options, calls, args: { host, cwd, skillDir: personal },
    plugin(sourceUrl = "https://github.com/EchoTechFE/qdmp-skill.git") {
      const root = path.join(config, "plugins/cache/qdmp-marketplace/qdmp/1.1.11");
      fs.cpSync(source, root, { recursive: true });
      for (const manifest of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) save(path.join(root, manifest, "plugin.json"), { name: "qdmp", version: "1.1.11" });
      skill(path.join(root, "skills/qdmp-skill"), "qdmp-skill");
      row = { name: "qdmp", pluginId: "qdmp@qdmp-marketplace", marketplaceName: "qdmp-marketplace", version: "1.1.11", installed: true, enabled: true, scope: "user", installedPath: root, marketplaceSource: { source: sourceUrl } };
      return row;
    }, setFail: value => fail = value, setVersion: value => commandVersion = value, setTamper: value => tamper = value,
    setRow: fn => { row = fn(row); } };
}

function pluginArgs(f, row = f.plugin()) { return { ...f.args, skillDir: path.join(row.installedPath, "skills/qdmp-skill") }; }

for (const host of ["codex", "claude-code", "qoder"]) for (const platform of ["darwin", "win32"]) {
  test(`${host}/${platform}: actual update capability, exact host routing and unchanged consent`, async t => {
    const f = fixture(t, host, platform); f.plugin();
    const sentinel = path.join(f.home, ".qdmp-skill/consents/sentinel.json"); save(sentinel, "existing consent unchanged");
    const r = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(r.state, "reload_required"); assert.equal(r.telemetry_changed, false); assert.equal(r.proceed_monitoring, false);
    assert.equal(r.personal_update.state, "updated");
    assert.equal(fs.readFileSync(sentinel, "utf8"), "existing consent unchanged");
    assert.ok(fs.existsSync(path.join(r.personal_update.backup, "qdmp-skill/SKILL.md")));
    assert.equal(fs.existsSync(path.join(f.config, "skills/qdmp-design-rules")), false, "never install absent companion Skills");
    const mutation = f.calls.find(c => ["add", "update"].includes(c.args[1]) && c.args[2] === "qdmp@qdmp-marketplace");
    assert.equal(r.plugin_update.state, "skipped");
    assert.equal(mutation, undefined);
    assert.ok(f.calls.every(c => !c.args.some(a => /telemetry|consent|activate|enable|remove/.test(a))));
    const again = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(again.personal_update.state, "current"); assert.deepEqual(again.changes, []);
    assert.equal(again.state, "current");
    assert.equal(again.proceed_monitoring, true);
    assert.equal(auditInstallation(f.args, f.options).copies.find(copy => copy.channel === "plugin_cache").version, "1.1.11");
  });
}
test("diagnosis finds duplicates and stale flow without writing files or refreshing markets", async t => {
  const f = fixture(t); f.plugin();
  const id = crypto.randomUUID(), dir = path.join(f.home, ".qdmp-skill/monitor-flows", id);
  save(path.join(dir, "state.json"), { host: "codex", directory: f.cwd, state: "entry_verified", manifest_digest: "old", decision: "approve" });
  save(path.join(dir, "onboarding.mjs"), "old entry");
  const before = fs.readFileSync(path.join(dir, "state.json"), "utf8");
  const r = await ensureCurrent("diagnose", f.args, f.options);
  assert.equal(r.duplicate_installations, true); assert.equal(r.flows[0].current, false); assert.equal(r.flows[0].next_action, "new_notice_required");
  assert.equal(fs.readFileSync(path.join(dir, "state.json"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(dir, "onboarding.mjs"), "utf8"), "old entry");
  assert.equal(fs.existsSync(path.join(f.home, ".qdmp-skill/backups")), false); assert.equal(f.calls.length, 2);
});
test("another IDE's Skill, plugin and flows cannot enter current host decisions", t => {
  const f = fixture(t, "qoder");
  skill(path.join(f.home, ".codex/skills/qdmp-skill"), "qdmp-skill");
  const id = crypto.randomUUID(); save(path.join(f.home, ".qdmp-skill/monitor-flows", id, "state.json"), { host: "codex", directory: f.cwd, state: "entry_verified" });
  const r = auditInstallation(f.args, f.options); assert.equal(r.copies.length, 1); assert.equal(r.flows.length, 0);
});
test("an orphaned plugin cache alone is not an installed duplicate", async t => {
  const f = fixture(t); f.plugin(); f.setRow(() => null);
  const r = await ensureCurrent("diagnose", f.args, f.options);
  assert.equal(r.multiple_disk_copies, true); assert.equal(r.duplicate_installations, false);
});
for (const source of ["/local/development/repo", "https://github.com/attacker/qdmp-skill.git"]) test(`custom market is not replaced: ${source}`, async t => {
  const f = fixture(t);
  const r = await ensureCurrent("ensure", pluginArgs(f, f.plugin(source)), f.options);
  assert.equal(r.plugin_update.reason, "local_custom_or_pinned_marketplace");
  assert.ok(f.calls.every(c => c.args[1] === "list" || c.args[2] === "list"));
});
test("disabled, pinned, non-user and multiple installations stop plugin mutation", async t => {
  for (const change of [r => ({ ...r, enabled: false }), r => ({ ...r, marketplaceSource: { ...r.marketplaceSource, ref: "v1.1.11" } }), r => ({ ...r, scope: "project", projectPath: f.cwd })]) {
    var f = fixture(t); const args = pluginArgs(f); f.setRow(change);
    const r = await ensureCurrent("ensure", args, f.options); assert.equal(r.plugin_update.state, "manual_required");
    assert.ok(f.calls.every(c => c.args[1] === "list" || c.args[2] === "list"));
  }
  const g = fixture(t); const plugin = pluginArgs(g); const original = g.options.commandResult;
  g.options.commandResult = (...args) => { const v = original(...args); if (args[1][1] === "list") v.installed.push({ ...v.installed[0] }); return v; };
  assert.equal((await ensureCurrent("ensure", plugin, g.options)).plugin_update.reason, "inventory_unavailable");
});
test("failed or uncertain plugin updates are backed up and never replayed automatically", async t => {
  const f = fixture(t); const args = pluginArgs(f); f.setFail(true);
  const a = await ensureCurrent("ensure", args, f.options); assert.equal(a.plugin_update.reason, "update_failed_or_unverified");
  assert.ok(fs.existsSync(a.plugin_update.backup));
  f.setFail(false); const b = await ensureCurrent("ensure", args, f.options);
  assert.equal(b.plugin_update.reason, "previous_update_attempt_requires_readback");
  assert.equal(f.calls.filter(c => c.args[1] === "add").length, 1);
});
test("successful exit with wrong version or wrong cached content is not success", async t => {
  for (const tamper of [false, true]) {
    const f = fixture(t); const args = pluginArgs(f); if (tamper) f.setTamper(true); else f.setVersion("1.1.12");
    const r = await ensureCurrent("ensure", args, f.options); assert.equal(r.plugin_update.reason, "update_failed_or_unverified");
    const second = await ensureCurrent("ensure", args, f.options);
    assert.equal(second.plugin_update.reason, "previous_update_attempt_requires_readback", "same version must not hide a previous failed content verification");
  }
});
test("Qoder Desktop without CLI can verify an absent plugin channel from its own explicit registry", async t => {
  const f = fixture(t, "qoder");
  save(path.join(f.config, "plugins/installed_plugins.json"), { version: 2, plugins: { "agent-runtime-telemetry@monitor": [] } });
  f.options.commandResult = () => { throw new Error("ENOENT qoderclicn"); };
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.personal_update.state, "updated"); assert.equal(r.plugin_update.state, "not_installed");
  const again = await ensureCurrent("ensure", f.args, f.options); assert.equal(again.state, "current"); assert.equal(again.proceed_monitoring, true);
  save(path.join(f.config, "plugins/installed_plugins.json"), { version: 2, plugins: { "qdmp@qdmp-marketplace": [{ version: "1.1.11" }] } });
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).state, "current");
});
test("release lookup failure cannot perform any update or run old onboarding", async t => {
  const f = fixture(t); f.options.latestRelease = async () => { throw new Error("offline"); };
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.state, "release_check_failed"); assert.equal(r.proceed_monitoring, false); assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(path.join(f.home, ".qdmp-skill")), false);
});
test("current/newer versions are never downgraded", async t => {
  const f = fixture(t); skill(f.personal, "qdmp-skill", "1.2.0"); f.plugin(); f.setRow(r => ({ ...r, version: "1.2.0" }));
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.state, "current"); assert.deepEqual(r.changes, []);
  assert.ok(f.calls.every(c => c.args[1] === "list" || c.args[2] === "list"));
});
test("linked personal Skill is not overwritten", async t => {
  const f = fixture(t), linked = path.join(f.home, "dev-skill"); fs.renameSync(f.personal, linked); fs.symlinkSync(linked, f.personal);
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.personal_update.reason, "linked_personal_skill");
  assert.equal(fs.lstatSync(f.personal).isSymbolicLink(), true);
});
test("legacy installation gains bundled version metadata without a redundant version receipt", async t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.personal, "references/skill-release.json"));
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).personal_update.state, "updated");
  assert.equal(auditInstallation(f.args, f.options).loaded_version, latest.version);
  fs.appendFileSync(path.join(f.personal, "SKILL.md"), "\nlocally changed\n");
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).personal_update.reason, "same_version_content_mismatch");
  assert.equal(fs.existsSync(path.join(f.home, ".qdmp-skill/skill-installations.json")), false);
});
test("invalid release contents cannot replace personal files or update plugins", async t => {
  const f = fixture(t); f.plugin(); save(path.join(f.source, ".qoder-plugin/plugin.json"), { name: "qdmp", version: "0.0.1" });
  const before = fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8");
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.personal_update.state, "manual_required"); assert.equal(r.plugin_update.state, "skipped");
  assert.equal(fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8"), before); assert.ok(f.calls.every(c => !["add", "update", "upgrade"].includes(c.args[1])));
});
test("old decline and ambiguous mutation remain distinct; current mismatched entry is blocked", t => {
  const f = fixture(t), release = { onboarding: { sha256: hash("new") } };
  const dir = path.join(f.home, "flow"); fs.mkdirSync(dir); save(path.join(dir, "onboarding.mjs"), "old");
  assert.equal(flowCompatibility({ state: "declined", manifest_digest: "old" }, release, dir).next_action, "retain_decline_do_not_prompt");
  assert.equal(flowCompatibility({ state: "executing", manifest_digest: "old" }, release, dir).next_action, "inspect_live_runtime_without_replaying_old_entry");
  assert.equal(flowCompatibility({ state: "choice_ready", manifest_digest: hash(JSON.stringify(release)) }, release, dir).reason, "onboarding_checksum_mismatch");
});
test("concurrent update lock is retained, never automatically cleared", async t => {
  const f = fixture(t); save(path.join(f.home, ".qdmp-skill/skill-update.lock"), "other process");
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).state, "update_busy");
  assert.equal(fs.readFileSync(path.join(f.home, ".qdmp-skill/skill-update.lock"), "utf8"), "other process");
});
test("Windows npm shim resolves JS entry without shell interpolation", t => {
  const f = fixture(t), bin = path.join(f.home, "Program Files & test"), entry = path.join(bin, "node_modules/@scope/cli/cli.js");
  save(path.join(bin, "claude.cmd"), "not executed"); save(entry, "// fixture");
  save(path.join(bin, "node_modules/@scope/cli/package.json"), { name: "@scope/cli", bin: { claude: "cli.js" } });
  const args = ["plugin", "update", "qdmp@qdmp-marketplace"];
  const result = hostInvocation("claude", args, { platform: "win32", env: { Path: bin } });
  assert.equal(result.command, process.execPath); assert.deepEqual(result.args, [entry, ...args]);
});
test("invalid host/arguments and unstable versions fail closed", async t => {
  const f = fixture(t); assert.throws(() => auditInstallation({ ...f.args, host: "auto" }, f.options), /explicit/);
  assert.equal(compare("1.1.13-beta", "1.1.12"), null);
  await assert.rejects(main(["ensure", "--host", "codex", "--host", "qoder"]), /duplicate/);
});
const published = (tag_name, extra = {}) => ({ tag_name, draft: false, prerelease: false,
  published_at: "2026-01-01T00:00:00Z", ...extra });
const publishedRef = (tag, sha, type = "commit") => ({ ref: `refs/tags/${tag}`, object: { type, sha } });

test("latest QDMP version comes from published stable GitHub Releases across their pages", async () => {
  const calls = [], distribution = { version: "0.2.17", onboarding: { sha256: "a".repeat(64) } };
  const base = "https://api.github.com/repos/EchoTechFE/qdmp-skill";
  const sha = "a".repeat(40), annotated = "b".repeat(40);
  const pages = new Map([
    [`${base}/releases?per_page=100&page=1`, [
      published("v1.1.9"), published("v9.0.0-beta"), published("v01.9.0"),
      published("v90.0.0", { draft: true }), published("v91.0.0", { prerelease: true }),
      published("v92.0.0", { published_at: null }),
      ...Array.from({ length: 94 }, (_, i) => published(`agent-runtime-telemetry-9.0.${i}`))
    ]],
    [`${base}/releases?per_page=100&page=2`, [published("v1.1.13", {
      body: "# QDMP Skill v1.1.13\n\n## 用户可见更新\n\n- 新增入口\n\n## 升级方式\n- 从原渠道更新"
    }), published("v1.0.99")]],
    [`${base}/git/ref/tags/v1.1.13`, publishedRef("v1.1.13", annotated, "tag")],
    [`${base}/git/tags/${annotated}`, { sha: annotated, object: { sha, type: "commit" } }],
    [`${base}/contents/skills/qdmp-skill/references/telemetry-distribution.json?ref=${sha}`, distribution]
  ]);
  const r = await latestRelease({ fetch: async url => {
    calls.push(url);
    assert.ok(pages.has(url), url);
    return new Response(JSON.stringify(pages.get(url)));
  } });
  assert.equal(r.version, "1.1.13");
  assert.equal(r.tag, "v1.1.13");
  assert.equal(r.commit, sha);
  assert.deepEqual(r.highlights, ["新增入口"]);
  assert.deepEqual(r.distribution, distribution);
  assert.deepEqual(calls, [...pages.keys()]);
  await assert.rejects(latestRelease({ fetch: async () => new Response("[]") }),
    error => error.details.stage === "release_list" && /No published stable QDMP release/.test(error.message));
  await assert.rejects(latestRelease({ fetch: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test("incomplete release pages and malformed release tag commits leave the update target unknown", async () => {
  const firstPage = Array.from({ length: 100 }, () => published("v1.1.15"));
  const calls = [];
  await assert.rejects(latestRelease({ fetch: async url => {
    calls.push(url);
    return calls.length === 1 ? new Response(JSON.stringify(firstPage)) : new Response("denied", { status: 403 });
  } }), error => error.details.stage === "release_list");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.includes("/releases?")));
  await assert.rejects(latestRelease({ fetch: async url => new Response(JSON.stringify(url.includes("/releases?")
    ? [published("v1.1.15")] : publishedRef("v1.1.15", "main"))) }),
    error => error.details.stage === "release_commit");
});
test("diagnosis compares historical flows against latest release, not the stale loaded manifest", async t => {
  const f = fixture(t), id = crypto.randomUUID(), dir = path.join(f.home, ".qdmp-skill/monitor-flows", id);
  const old = JSON.parse(fs.readFileSync(path.join(f.personal, "references/telemetry-distribution.json")));
  save(path.join(dir, "state.json"), { state: "entry_verified", host: "codex", directory: f.cwd, manifest_digest: hash(JSON.stringify(old)) });
  save(path.join(dir, "onboarding.mjs"), "new entry");
  assert.equal(auditInstallation(f.args, f.options).flows[0].current, true);
  f.options.latestRelease = async () => ({ ...latest, distribution: { ...old, version: "0.2.17" } });
  assert.equal((await ensureCurrent("diagnose", f.args, f.options)).flows[0].reason, "pinned_manifest_changed");
});
test("personal multi-Skill update rolls back previous replacements on a later failure", async t => {
  const f = fixture(t); skill(path.join(f.config, "skills/qdmp-design-rules"), "qdmp-design-rules");
  const before = fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8"), rename = fs.renameSync;
  let injected = false;
  fs.renameSync = (from, to) => {
    if (!injected && to === path.join(f.config, "skills/qdmp-design-rules/SKILL.md")) { injected = true; throw new Error("fixture rename failure"); }
    return rename(from, to);
  };
  try {
    const r = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(r.personal_update.state, "manual_required"); assert.match(r.personal_update.diagnostic, /rolled back/);
    assert.equal(fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8"), before);
    assert.ok(fs.readFileSync(path.join(f.config, "skills/qdmp-design-rules/SKILL.md"), "utf8").includes("1.1.11"));
  } finally { fs.renameSync = rename; }
});
test("repository release tag matches the four Skills and three plugin manifests", () => {
  const repo = fileURLToPath(new URL("../", import.meta.url));
  const notes = fs.readFileSync(path.join(repo, "skills/qdmp-skill/references/release-notes.md"), "utf8");
  const tag = checkReleaseVersion(repo);
  assert.equal(checkReleaseVersion(repo, tag), tag);
  assert.ok(releaseHighlights(notes).length > 0);
});

test("release preflight rejects a single stale plugin, Skill, planned tag, or actual tag", t => {
  const repo = fileURLToPath(new URL("../", import.meta.url));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-release-check-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const plugins = ["codex", "claude", "qoder"].map(host => `.${host}-plugin/plugin.json`);
  const skills = names.map(name => `skills/${name}/references/skill-release.json`);
  const instructions = "skills/qdmp-skill/SKILL.md";
  const notes = "skills/qdmp-skill/references/release-notes.md";
  for (const file of [...plugins, ...skills, instructions, notes]) {
    save(path.join(fixture, file), fs.readFileSync(path.join(repo, file), "utf8"));
  }
  const tag = checkReleaseVersion(fixture);
  for (const file of [...plugins, ...skills, instructions, notes]) {
    const local = path.join(fixture, file);
    const good = fs.readFileSync(local, "utf8");
    fs.writeFileSync(local, good.replace(tag.slice(1), "9.9.9"));
    assert.throws(() => checkReleaseVersion(fixture), /expected/);
    fs.writeFileSync(local, good);
  }
  const primary = path.join(fixture, skills[0]);
  const good = fs.readFileSync(primary, "utf8");
  save(primary, { ...JSON.parse(good), plugin_version: "9.9.9" });
  assert.throws(() => checkReleaseVersion(fixture), /plugin_version/);
  fs.writeFileSync(primary, good);
  assert.throws(() => checkReleaseVersion(fixture, "v9.9.9"), /Git release tag/);
});

test("release highlights keep the first five items in publication order", () => {
  const items = ["部署", "迁移", "提审", "前端性能", "PRD", "维护"];
  const notes = ["## 用户可见更新", ...items.map(item => `- ${item}`), "## 升级方式", "- 重载"].join("\n");
  assert.deepEqual(releaseHighlights(notes), items.slice(0, 5));
});

function writeReleaseNotes(root) {
  save(path.join(root, "references/release-notes.md"), `# QDMP Skill ${latest.tag}\n\n## 用户可见更新\n\n- 新增入口\n`);
}

test("verified update is reported before reload, and loaded capabilities appear once after reload", async t => {
  const f = fixture(t);
  writeReleaseNotes(path.join(f.source, "skills/qdmp-skill"));
  f.options.latestRelease = async () => ({ ...latest, highlights: ["新增入口"] });
  const oldSession = { ...f.args, loadedVersion: "1.1.11" };
  const installed = await ensureCurrent("ensure", oldSession, f.options);
  assert.equal(installed.update_notice.kind, "reload_required");
  assert.equal(installed.reload_for_current, true);
  assert.deepEqual(installed.update_notice.highlights, []);
  const oldAgain = await ensureCurrent("ensure", oldSession, f.options);
  assert.equal(oldAgain.reload_required, true);
  assert.equal(oldAgain.update_notice, undefined);
  assert.equal(oldAgain.proceed_monitoring, false);
  const diagnosed = await ensureCurrent("diagnose", oldSession, f.options);
  assert.equal(diagnosed.session_version, "1.1.11");
  assert.equal(diagnosed.loaded_version, latest.version);
  assert.equal(diagnosed.reload_for_current, true);
  assert.equal(diagnosed.latest.version, latest.version);
  assert.equal(diagnosed.update_notice, undefined);
  const newSession = { ...f.args, loadedVersion: latest.version };
  const loaded = (await ensureCurrent("ensure", newSession, f.options)).update_notice;
  assert.equal(loaded.kind, "loaded");
  assert.deepEqual(loaded.highlights, ["新增入口"]);
  assert.equal((await ensureCurrent("ensure", newSession, f.options)).update_notice, undefined);
});

test("a host-managed update has a read-only diagnostic and one offline loaded notice", async t => {
  const f = fixture(t, "claude-code");
  const plugin = f.plugin();
  const active = path.join(path.dirname(plugin.installedPath), latest.version);
  fs.cpSync(f.source, active, { recursive: true });
  const skillDir = path.join(active, "skills/qdmp-skill");
  writeReleaseNotes(skillDir);
  f.options.latestRelease = async () => { throw new Error("offline"); };
  const args = { ...f.args, skillDir, loadedVersion: latest.version };
  const diagnosed = await ensureCurrent("diagnose", args, f.options);
  assert.equal(diagnosed.state, "release_check_failed");
  assert.deepEqual(diagnosed.disk_release.highlights, ["新增入口"]);
  assert.equal(fs.existsSync(path.join(f.home, ".qdmp-skill/release-notices")), false);
  const first = await ensureCurrent("ensure", args, f.options);
  assert.equal(first.update_notice.kind, "loaded");
  assert.equal(first.update_notice.channel, "plugin_cache");
  const secondWorkspace = path.join(f.home, "another-workspace");
  fs.mkdirSync(secondWorkspace);
  assert.equal((await ensureCurrent("ensure", { ...args, cwd: secondWorkspace }, f.options)).update_notice, undefined);
  assert.deepEqual((await ensureCurrent("diagnose", args, f.options)).disk_release.highlights, ["新增入口"]);
});

test("an existing verified standalone copy is enough when the old plugin is still loaded", async t => {
  const f = fixture(t, "qoder"), plugin = f.plugin();
  const args = { ...pluginArgs(f, plugin), loadedVersion: "1.1.11" };
  fs.cpSync(path.join(f.source, "skills/qdmp-skill"), f.personal, { recursive: true });
  const ready = await ensureCurrent("ensure", args, f.options);
  assert.deepEqual(ready.switch_to, { channel: "personal", skill_dir: f.personal, version: latest.version });
  assert.equal(ready.update_notice.kind, "switch_required");
  assert.equal(ready.proceed_monitoring, false);
  assert.deepEqual(ready.changes, []);
  assert.equal((await ensureCurrent("ensure", args, f.options)).update_notice, undefined);
  assert.equal(auditInstallation(args, f.options).loaded_version, "1.1.11");
  const switched = await ensureCurrent("ensure", { ...f.args, loadedVersion: latest.version }, f.options);
  assert.equal(switched.state, "current");
  assert.equal(switched.proceed_monitoring, true);
  assert.equal(switched.plugin_update.state, "skipped");
});

test("an existing verified plugin is enough when the old standalone copy is loaded", async t => {
  const f = fixture(t), plugin = f.plugin();
  const active = path.join(path.dirname(plugin.installedPath), latest.version);
  fs.cpSync(f.source, active, { recursive: true });
  f.setRow(row => ({ ...row, installedPath: active, version: latest.version }));
  const ready = await ensureCurrent("ensure", { ...f.args, loadedVersion: "1.1.11" }, f.options);
  assert.equal(ready.update_notice.kind, "switch_required");
  assert.equal(ready.switch_to.skill_dir, path.join(active, "skills/qdmp-skill"));
  assert.equal(auditInstallation(f.args, f.options).loaded_version, "1.1.11");
  assert.ok(f.calls.every(call => !["add", "update"].includes(call.args[1])));
});

test("an orphaned or modified plugin cannot replace the active standalone update", async t => {
  for (const orphaned of [true, false]) {
    const f = fixture(t), plugin = f.plugin();
    const active = path.join(path.dirname(plugin.installedPath), latest.version);
    fs.cpSync(f.source, active, { recursive: true });
    if (!orphaned) save(path.join(active, ".mcp.json"), { unpublished: true });
    f.setRow(row => orphaned ? null : { ...row, installedPath: active, version: latest.version });
    const updated = await ensureCurrent("ensure", { ...f.args, loadedVersion: "1.1.11" }, f.options);
    assert.equal(updated.update_notice.kind, "reload_required");
    assert.deepEqual(updated.changes, ["personal_update"]);
    assert.equal(updated.switch_to, undefined);
    assert.ok(f.calls.every(call => !["add", "update"].includes(call.args[1])));
  }
});

test("a manual update offer is shown once per installation and version", async t => {
  const f = fixture(t, "qoder");
  const plugin = f.plugin();
  const skillDir = path.join(plugin.installedPath, "skills/qdmp-skill");
  fs.renameSync(f.personal, path.join(f.home, "inactive-personal"));
  f.options.latestRelease = async () => ({ ...latest, highlights: ["能力一", "能力二", "能力三"] });
  const args = { ...f.args, skillDir, loadedVersion: "1.1.11" };
  const offer = (await ensureCurrent("ensure", args, f.options)).update_notice;
  assert.equal(offer.kind, "available");
  assert.equal(offer.version, latest.version);
  assert.deepEqual(offer.highlights, ["能力一"]);
  assert.equal((await ensureCurrent("ensure", args, f.options)).update_notice, undefined);
  const explicit = await ensureCurrent("diagnose", args, f.options);
  assert.deepEqual(explicit.latest.highlights, ["能力一", "能力二", "能力三"]);
  assert.equal(explicit.update_notice, undefined);
});

test("an update installed during lookup is detected before touching the already updated copy", async t => {
  const f = fixture(t);
  writeReleaseNotes(path.join(f.source, "skills/qdmp-skill"));
  f.options.latestRelease = async () => {
    fs.cpSync(path.join(f.source, "skills/qdmp-skill"), f.personal, { recursive: true });
    return latest;
  };
  const pending = await ensureCurrent("ensure", { ...f.args, loadedVersion: "1.1.11" }, f.options);
  assert.equal(pending.reload_for_current, true);
  assert.equal(pending.update_notice.kind, "reload_required");
  assert.equal(pending.loaded_version, latest.version);
  assert.deepEqual(pending.changes, []);
  assert.equal(pending.proceed_monitoring, false);
});

test("first load shows capabilities and reports a duplicate it cannot safely retire", async t => {
  const f = fixture(t);
  f.plugin();
  const main = path.join(f.source, "skills/qdmp-skill");
  writeReleaseNotes(main);
  fs.cpSync(main, f.personal, { recursive: true });
  const args = { ...f.args, loadedVersion: latest.version };
  const activated = await ensureCurrent("ensure", args, f.options);
  assert.equal(activated.update_notice.kind, "loaded");
  assert.equal(activated.reload_for_current, false);
  assert.equal(activated.plugin_update.state, "skipped");
  assert.deepEqual(activated.update_notice.highlights, ["新增入口"]);
  assert.equal(activated.channel_cleanup.state, "manual_required");
  assert.equal((await ensureCurrent("ensure", args, f.options)).update_notice, undefined);
});

for (const host of ["codex", "claude-code", "qoder"]) {
  test(`${host}: retire the older official plugin only after verifying the loaded standalone Skill`, async t => {
    const f = fixture(t, host), plugin = f.plugin();
    const previous = path.join(f.home, "previous-release");
    fs.cpSync(plugin.installedPath, previous, { recursive: true });
    f.options.checkout = release => ({ root: release.version === latest.version ? f.source : previous });
    fs.cpSync(path.join(f.source, "skills/qdmp-skill"), f.personal, { recursive: true });
    const args = { ...f.args, loadedVersion: latest.version };
    const pending = await ensureCurrent("ensure", { ...args, loadedVersion: "1.1.11" }, f.options);
    assert.equal(pending.state, "reload_required");
    assert.ok(fs.existsSync(plugin.installedPath));
    const result = await ensureCurrent("ensure", args, f.options);
    assert.deepEqual(result.channel_cleanup, { state: "retired", channel: "plugin_cache" });
    assert.equal(result.duplicate_installations, false);
    assert.equal(result.proceed_monitoring, true);
    assert.ok(fs.existsSync(f.personal));
    const backup = path.join(f.home, ".qdmp-skill/channel-cleanup");
    assert.ok(!fs.existsSync(backup) || fs.readdirSync(backup).length === 0);
    const again = await ensureCurrent("ensure", args, f.options);
    assert.equal(again.channel_cleanup, undefined);
    assert.equal(again.duplicate_installations, false);
  });
}

test("verified installed and loaded plugin retires pristine standalone Skills and deletes its temporary backup", async t => {
  const f = fixture(t), original = f.plugin();
  const root = path.join(path.dirname(original.installedPath), latest.version);
  fs.cpSync(f.source, root, { recursive: true });
  f.setRow(row => ({ ...row, installedPath: root, version: latest.version }));
  const previous = path.join(f.home, "previous-release");
  for (const name of names) {
    const installed = path.join(f.config, "skills", name);
    skill(installed, name);
    fs.cpSync(installed, path.join(previous, "skills", name), { recursive: true });
  }
  f.options.checkout = release => ({ root: release.version === latest.version ? f.source : previous });
  const args = { ...pluginArgs(f, { installedPath: root }), loadedVersion: latest.version };
  const result = await ensureCurrent("ensure", args, f.options);
  assert.deepEqual(result.channel_cleanup, { state: "retired", channel: "personal" });
  assert.equal(result.update_notice.kind, "channel_retired");
  assert.ok(names.every(name => !fs.existsSync(path.join(f.config, "skills", name))));
  assert.ok(fs.existsSync(args.skillDir));
  assert.deepEqual(fs.readdirSync(path.join(f.home, ".qdmp-skill/channel-cleanup")), []);
});

test("locally edited duplicate Skills survive automatic retirement", async t => {
  const f = fixture(t), plugin = f.plugin();
  const root = path.join(path.dirname(plugin.installedPath), latest.version);
  fs.cpSync(f.source, root, { recursive: true });
  f.setRow(row => ({ ...row, installedPath: root, version: latest.version }));
  fs.appendFileSync(path.join(f.personal, "SKILL.md"), "local content\n");
  const result = await ensureCurrent("ensure", {
    ...pluginArgs(f, { installedPath: root }), loadedVersion: latest.version
  }, f.options);
  assert.equal(result.channel_cleanup.state, "manual_required");
  assert.match(fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8"), /local content/);
  assert.equal(result.proceed_monitoring, true);
});

test("failed single-channel readback restores the displaced standalone entry", async t => {
  const f = fixture(t), original = f.plugin();
  const root = path.join(path.dirname(original.installedPath), latest.version);
  fs.cpSync(f.source, root, { recursive: true });
  f.setRow(row => ({ ...row, installedPath: root, version: latest.version }));
  const previous = path.join(f.home, "previous-release");
  fs.cpSync(f.personal, path.join(previous, "skills/qdmp-skill"), { recursive: true });
  f.options.checkout = release => ({ root: release.version === latest.version ? f.source : previous });
  const inventory = f.options.commandResult;
  f.options.commandResult = (...args) => args[1][1] === "list" && !fs.existsSync(f.personal)
    ? { installed: [] } : inventory(...args);
  const result = await ensureCurrent("ensure", { ...pluginArgs(f, { installedPath: root }), loadedVersion: latest.version }, f.options);
  assert.equal(result.channel_cleanup.state, "manual_required");
  assert.equal(result.duplicate_installations, true);
  assert.equal(auditInstallation(f.args, f.options).loaded_version, "1.1.11");
  assert.equal(result.proceed_monitoring, false);
});

test("same-version stale personal content cannot be reported current", async t => {
  const f = fixture(t); skill(f.personal, "qdmp-skill", latest.version);
  save(path.join(f.personal, "references/telemetry-distribution.json"), { version: "0.2.14", onboarding: { sha256: "a".repeat(64) } });
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.personal_update.reason, "same_version_content_mismatch"); assert.equal(r.proceed_monitoring, false);
});
test("the actually loaded unmanaged copy must match published contents even when its version is current", async t => {
  const f = fixture(t); skill(f.personal, "qdmp-skill", latest.version);
  const loaded = path.join(f.home, "project-skill"); fs.cpSync(f.personal, loaded, { recursive: true });
  fs.appendFileSync(path.join(loaded, "SKILL.md"), "\nold local instructions\n");
  const before = fs.readFileSync(path.join(loaded, "SKILL.md"), "utf8");
  const result = await ensureCurrent("ensure", { ...f.args, skillDir: loaded }, f.options);
  assert.equal(result.personal_update.state, "skipped"); assert.equal(result.state, "manual_required");
  assert.equal(result.loaded_content_verified, false); assert.equal(result.proceed_monitoring, false);
  assert.equal(fs.readFileSync(path.join(loaded, "SKILL.md"), "utf8"), before);
});
test("same-version plugin checks the entire package, including MCP and hooks", async t => {
  const f = fixture(t); const row = f.plugin();
  fs.cpSync(f.source, row.installedPath, { recursive: true });
  f.setRow(r => ({ ...r, version: latest.version }));
  save(path.join(row.installedPath, ".mcp.json"), { mcpServers: { unpublished: {} } });
  const r = await ensureCurrent("ensure", pluginArgs(f, row), f.options);
  assert.equal(r.plugin_update.reason, "same_version_content_mismatch"); assert.equal(r.proceed_monitoring, false);
});
test("a stable Skill release can install and verify a different plugin package version", async t => {
  const f = fixture(t), args = pluginArgs(f);
  const pluginVersion = "1.1.18";
  const file = path.join(f.source, "skills/qdmp-skill/references/skill-release.json");
  save(file, { ...JSON.parse(fs.readFileSync(file, "utf8")), plugin_version: pluginVersion });
  for (const host of ["codex", "claude", "qoder"]) {
    save(path.join(f.source, `.${host}-plugin/plugin.json`), { name: "qdmp", version: pluginVersion });
  }
  f.setVersion(pluginVersion);
  const updated = await ensureCurrent("ensure", { ...args, loadedVersion: "1.1.11" }, f.options);
  assert.equal(updated.state, "reload_required");
  assert.equal(updated.plugin_update.version, pluginVersion);
  assert.equal(updated.latest.version, latest.version);
  const skillDir = path.join(updated.plugin_update.root, "skills/qdmp-skill");
  const loaded = await ensureCurrent("ensure", { ...args, skillDir, loadedVersion: latest.version }, f.options);
  assert.equal(loaded.loaded_version, latest.version);
  assert.equal(loaded.plugin_update.version, pluginVersion);
  assert.equal(loaded.loaded_content_verified, true);
});

test("Codex: unpublished non-Skill files fail post-install verification", async t => {
  const f = fixture(t); const args = pluginArgs(f); const original = f.options.commandResult;
  f.options.commandResult = (...args) => {
    const value = original(...args);
    if (["add", "update"].includes(args[1][1])) save(path.join(f.config, "plugins/cache/qdmp-marketplace/qdmp", latest.version, ".mcp.json"), { unpublished: true });
    return value;
  };
  const r = await ensureCurrent("ensure", args, f.options);
  assert.equal(r.plugin_update.reason, "update_failed_or_unverified"); assert.equal(r.state, "manual_required");
  assert.equal(r.proceed_monitoring, false);
});
test("Codex install uses only the frozen per-command source and does not rewrite global source", async t => {
  const f = fixture(t); const args = pluginArgs(f);
  const r = await ensureCurrent("ensure", args, f.options); assert.equal(r.plugin_update.state, "updated");
  const command = f.calls.find(c => c.args[1] === "add").args;
  assert.ok(command.includes('marketplaces.qdmp-marketplace.source_type="local"'));
  assert.ok(command.some(a => a.startsWith('marketplaces.qdmp-marketplace.source="') && a.includes("/.qdmp-skill/releases/")));
  assert.equal(fs.existsSync(path.join(f.config, "config.toml")), false);
});
test("active channel verification uses one release checkout and one cleanup", async t => {
  const f = fixture(t); f.plugin(); let downloads = 0, cleaned = 0;
  f.options.checkout = () => { downloads++; return { root: f.source, cleanup: () => cleaned++ }; };
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).state, "reload_required");
  assert.equal(downloads, 1); assert.equal(cleaned, 1);
});
test("a failed release checkout stops the active channel update", async t => {
  const f = fixture(t); f.plugin(); let downloads = 0;
  f.options.checkout = () => { downloads++; throw new Error("offline checkout"); };
  const result = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(result.state, "manual_required"); assert.equal(downloads, 1);
});
test("all four bundled version declarations are required before any installation files change", async t => {
  for (const name of names) {
    const f = fixture(t); f.plugin();
    fs.unlinkSync(path.join(f.source, "skills", name, "references/skill-release.json"));
    const before = fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8");
    const result = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(result.personal_update.state, "manual_required"); assert.equal(result.plugin_update.state, "skipped");
    assert.equal(fs.readFileSync(path.join(f.personal, "SKILL.md"), "utf8"), before);
  }
});
test("companions are inspected even if the main Skill is current, and newer companions are preserved", async t => {
  const f = fixture(t); skill(f.personal, "qdmp-skill", latest.version);
  const old = path.join(f.config, "skills/qdmp-design-rules"), newer = path.join(f.config, "skills/qdmp-product-rules");
  skill(old, "qdmp-design-rules", "1.1.11"); skill(newer, "qdmp-product-rules", "1.2.0");
  save(path.join(newer, "references/skill-release.json"), { repository: "EchoTechFE/qdmp-skill", version: "1.2.0" });
  const before = fs.readFileSync(path.join(newer, "SKILL.md"), "utf8");
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.personal_update.state, "updated"); assert.ok(r.personal_update.skills.includes("qdmp-design-rules"));
  assert.equal(fs.readFileSync(path.join(newer, "SKILL.md"), "utf8"), before);
  assert.equal(r.personal_update.preserved[0].version, "1.2.0");
});
test("a failed active plugin update never falls through to upgrading the standalone copy", async t => {
  const f = fixture(t), args = pluginArgs(f); f.setFail(true);
  const r = await ensureCurrent("ensure", args, f.options);
  assert.equal(r.state, "manual_required"); assert.equal(r.reload_required, false);
  assert.equal(r.personal_update.state, "skipped");
  assert.equal(auditInstallation(f.args, f.options).loaded_version, "1.1.11");
  assert.equal(r.proceed_monitoring, false);
});
test("project plugin remains visible in a child directory and is not automatically changed", async t => {
  const f = fixture(t), row = f.plugin(), child = path.join(f.cwd, "subdir"); fs.mkdirSync(child);
  f.setRow(r => ({ ...r, scope: "project", projectPath: f.cwd }));
  f.options.commandResult = (_cmd, args) => args[1] === "list" ? { installed: [{ ...row, scope: "project", projectPath: f.cwd }] } : { marketplaces: [] };
  const r = await ensureCurrent("diagnose", { ...f.args, cwd: child }, f.options);
  assert.equal(r.plugin.version, "1.1.11"); assert.equal(r.plugin.scope, "project");
});
test("process exit mid-update keeps discovery entry and standalone recovery restores old files", async t => {
  const url = new URL("../skills/qdmp-skill/scripts/ensure-current.mjs", import.meta.url).href;
  const worker = `import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
    const {ensureCurrent}=await import(${JSON.stringify(url)});const latest=${JSON.stringify(latest)};const names=${JSON.stringify(names)};
    const save=${save.toString()};const hash=x=>'';const skill=${skill.toString()};const fixture=${fixture.toString()};
    const f=fixture({after(){}}); const rename=fs.renameSync;
    fs.renameSync=(from,to)=>{const r=rename(from,to);if(to===path.join(f.personal,'references/skill-release.json')){
      console.log(JSON.stringify({home:f.home,personal:f.personal}));process.exit(37);}return r;};
    await ensureCurrent('ensure',f.args,f.options);`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", worker], { encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 37, run.stderr);
  const data = JSON.parse(run.stdout); t.after(() => fs.rmSync(data.home, { recursive: true, force: true }));
  assert.equal(fs.existsSync(path.join(data.personal, "SKILL.md")), true);
  assert.ok(fs.existsSync(path.join(data.home, ".qdmp-skill/maintenance/recover-update.mjs")));
  const result = recoverPending(data.home); assert.equal(result.state, "restored");
  assert.equal(JSON.parse(fs.readFileSync(path.join(data.personal, "references/skill-release.json"))).version, "1.1.11");
  assert.equal(fs.existsSync(path.join(data.home, ".qdmp-skill/skill-update.lock")), false);
});

test("maintenance entry points execute through an aliased directory", t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-entry-test-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const alias = path.join(home, "scripts");
  const scripts = fileURLToPath(new URL("../skills/qdmp-skill/scripts/", import.meta.url));
  fs.symlinkSync(scripts, alias, "junction");

  for (const [script, error] of [["ensure-current.mjs", /explicit supported host/], ["recover-update.mjs", /Usage/]]) {
    const run = spawnSync(process.execPath, [path.join(alias, script), "diagnose"], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, error);
  }
});

test("an unavailable Telemetry pin does not block a verified Skill update or permit onboarding", async t => {
  const f = fixture(t);
  f.plugin();
  const { latestRelease: _fixtureRelease, ...options } = f.options;
  options.fetch = async url => {
    if (url.includes("/releases?")) return new Response(JSON.stringify([published(latest.tag)]));
    if (url.includes("/git/ref/tags/")) return new Response(JSON.stringify(publishedRef(latest.tag, "a".repeat(40))));
    return new Response("not found", { status: 404 });
  };

  await assert.rejects(latestRelease(options), error => error.details.stage === "manifest_api");
  const updated = await ensureCurrent("ensure", f.args, options);
  assert.equal(updated.latest.tag, latest.tag);
  assert.equal(updated.personal_update.state, "updated");
  assert.equal(updated.plugin_update.state, "skipped");
  assert.equal(updated.telemetry_pin_error.stage, "manifest_api");
  assert.equal(updated.telemetry_changed, false);
  assert.equal(updated.proceed_monitoring, false);

  const afterReload = await ensureCurrent("ensure", f.args, options);
  assert.equal(afterReload.state, "current");
  assert.equal(afterReload.loaded_content_verified, true);
  assert.equal(afterReload.proceed_monitoring, false);
});

test("successful QDMP update removes old frozen caches and prunes inactive host copies after verified reload", async t => {
  const f = fixture(t);
  const existing = f.plugin();
  const oldCopy = existing.installedPath;
  const frozen = path.join(f.home, ".qdmp-skill/releases/v1.1.11-aaaaaaaaaaaaaaaa");
  fs.cpSync(oldCopy, frozen, { recursive: true });
  const inUse = path.join(path.dirname(oldCopy), "1.1.10");
  fs.cpSync(oldCopy, inUse, { recursive: true });
  save(path.join(inUse, ".codex-plugin/plugin.json"), { name: "qdmp", version: "1.1.10" });
  save(path.join(inUse, ".in_use"), "");
  const unrelated = path.join(path.dirname(oldCopy), "1.1.9");
  save(path.join(unrelated, ".codex-plugin/plugin.json"), { name: "unrelated", version: "1.1.9" });
  const first = await ensureCurrent("ensure", { ...f.args, skillDir: path.join(oldCopy, "skills/qdmp-skill") }, f.options);
  assert.equal(first.plugin_update.state, "updated");
  assert.equal(fs.existsSync(frozen), false);
  assert.equal(fs.existsSync(oldCopy), true);
  assert.equal(fs.existsSync(f.personal), true);

  const second = await ensureCurrent("ensure", { ...f.args, skillDir: path.join(first.plugin_update.root, "skills/qdmp-skill") }, f.options);
  assert.equal(second.loaded_content_verified, true);
  assert.equal(fs.existsSync(oldCopy), false);
  assert.equal(fs.existsSync(inUse), true);
  assert.equal(fs.existsSync(unrelated), true);
  assert.equal(fs.existsSync(f.personal), true);
});
