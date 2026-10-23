import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { recoverPending } from "../skills/qdmp-skill/scripts/recover-update.mjs";
import { ensureCurrent, auditInstallation, flowCompatibility, compare, main, latestRelease, hostInvocation } from "../skills/qdmp-skill/scripts/ensure-current.mjs";

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

for (const host of ["codex", "claude-code", "qoder"]) for (const platform of ["darwin", "win32"]) {
  test(`${host}/${platform}: actual update capability, exact host routing and unchanged consent`, async t => {
    const f = fixture(t, host, platform); f.plugin();
    const sentinel = path.join(f.home, ".qdmp-skill/consents/sentinel.json"); save(sentinel, "existing consent unchanged");
    const r = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(r.state, host === "codex" ? "reload_required" : "partial_update"); assert.equal(r.telemetry_changed, false); assert.equal(r.proceed_monitoring, false);
    assert.equal(r.personal_update.state, "updated");
    assert.equal(fs.readFileSync(sentinel, "utf8"), "existing consent unchanged");
    assert.ok(fs.existsSync(path.join(r.personal_update.backup, "qdmp-skill/SKILL.md")));
    assert.equal(fs.existsSync(path.join(f.config, "skills/qdmp-design-rules")), false, "never install absent companion Skills");
    const mutation = f.calls.find(c => ["add", "update"].includes(c.args[1]) && c.args[2] === "qdmp@qdmp-marketplace");
    if (host === "codex") {
      assert.equal(r.plugin_update.state, "updated");
      assert.ok(fs.existsSync(path.join(r.plugin_update.backup, "qdmp-plugin")));
      assert.equal(mutation.args[1], "add");
    } else {
      assert.equal(r.plugin_update.reason, "immutable_plugin_update_not_supported");
      assert.equal(mutation, undefined);
    }
    assert.ok(f.calls.every(c => !c.args.some(a => /telemetry|consent|activate|enable|remove/.test(a))));
    const again = await ensureCurrent("ensure", f.args, f.options);
    assert.equal(again.personal_update.state, "current"); assert.deepEqual(again.changes, []);
    assert.equal(again.state, host === "codex" ? "current" : "manual_required");
    assert.equal(again.proceed_monitoring, host === "codex");
    assert.equal(f.calls.filter(c => c.args[1] === "marketplace" && !c.args.includes("--help") && c.args[2] !== "list").length, host === "codex" ? 1 : 0);
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
  const f = fixture(t); f.plugin(source);
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.plugin_update.reason, "local_custom_or_pinned_marketplace");
  assert.ok(f.calls.every(c => c.args[1] === "list" || c.args[2] === "list"));
});
test("disabled, pinned, non-user and multiple installations stop plugin mutation", async t => {
  for (const change of [r => ({ ...r, enabled: false }), r => ({ ...r, marketplaceSource: { ...r.marketplaceSource, ref: "v1.1.11" } }), r => ({ ...r, scope: "project", projectPath: f.cwd })]) {
    var f = fixture(t); f.plugin(); f.setRow(change);
    const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.plugin_update.state, "manual_required");
    assert.ok(f.calls.every(c => c.args[1] === "list" || c.args[2] === "list"));
  }
  const g = fixture(t); g.plugin(); const original = g.options.commandResult;
  g.options.commandResult = (...args) => { const v = original(...args); if (args[1][1] === "list") v.installed.push({ ...v.installed[0] }); return v; };
  assert.equal((await ensureCurrent("ensure", g.args, g.options)).plugin_update.reason, "inventory_unavailable");
});
test("failed or uncertain plugin updates are backed up and never replayed automatically", async t => {
  const f = fixture(t); f.plugin(); f.setFail(true);
  const a = await ensureCurrent("ensure", f.args, f.options); assert.equal(a.plugin_update.reason, "update_failed_or_unverified");
  assert.ok(fs.existsSync(a.plugin_update.backup));
  f.setFail(false); const b = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(b.plugin_update.reason, "previous_update_attempt_requires_readback");
  assert.equal(f.calls.filter(c => c.args[1] === "add").length, 1);
});
test("successful exit with wrong version or wrong cached content is not success", async t => {
  for (const tamper of [false, true]) {
    const f = fixture(t); f.plugin(); if (tamper) f.setTamper(true); else f.setVersion("1.1.12");
    const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.plugin_update.reason, "update_failed_or_unverified");
    const second = await ensureCurrent("ensure", f.args, f.options);
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
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).plugin_update.reason, "inventory_unavailable");
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
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.personal_update.state, "manual_required"); assert.equal(r.plugin_update.state, "manual_required");
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
test("stable release lookup ignores Telemetry tags, drafts, prereleases and main", async () => {
  const calls = [], distribution = { version: "0.2.17", onboarding: { sha256: "a".repeat(64) } };
  const r = await latestRelease({ fetch: async url => {
    calls.push(url); return { ok: true, text: async () => JSON.stringify(url.includes("/contents/") ? distribution : [
      { tag_name: "agent-runtime-telemetry-v9.0.0" }, { tag_name: "v9.0.0", draft: true },
      { tag_name: "v8.0.0", prerelease: true }, { tag_name: "v1.1.13-beta" }, { tag_name: "v1.1.9" }, { tag_name: "v1.1.13" }
    ]) };
  } });
  assert.equal(r.version, "1.1.13"); assert.deepEqual(r.distribution, distribution);
  assert.ok(calls[1].includes("ref=v1.1.13")); assert.ok(calls.every(u => !u.includes("/main/")));
  await assert.rejects(latestRelease({ fetch: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
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
test("release version is consistent across all three plugins and standalone metadata", () => {
  const repo = new URL("../", import.meta.url);
  const versions = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".qoder-plugin/plugin.json", ...names.map(n => `skills/${n}/references/skill-release.json`)]
    .map(file => JSON.parse(fs.readFileSync(new URL(file, repo))).version);
  assert.ok(versions.every(v => v === versions[0]));
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
  assert.equal(result.personal_update.state, "current"); assert.equal(result.state, "manual_required");
  assert.equal(result.loaded_content_verified, false); assert.equal(result.proceed_monitoring, false);
  assert.equal(fs.readFileSync(path.join(loaded, "SKILL.md"), "utf8"), before);
});
test("same-version plugin checks the entire package, including MCP and hooks", async t => {
  const f = fixture(t); const row = f.plugin();
  fs.cpSync(f.source, row.installedPath, { recursive: true });
  f.setRow(r => ({ ...r, version: latest.version }));
  save(path.join(row.installedPath, ".mcp.json"), { mcpServers: { unpublished: {} } });
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.plugin_update.reason, "same_version_content_mismatch"); assert.equal(r.proceed_monitoring, false);
});
test("Codex: unpublished non-Skill files fail post-install verification", async t => {
  const f = fixture(t); f.plugin(); const original = f.options.commandResult;
  f.options.commandResult = (...args) => {
    const value = original(...args);
    if (["add", "update"].includes(args[1][1])) save(path.join(f.config, "plugins/cache/qdmp-marketplace/qdmp", latest.version, ".mcp.json"), { unpublished: true });
    return value;
  };
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.plugin_update.reason, "update_failed_or_unverified"); assert.equal(r.state, "partial_update");
  assert.equal(r.proceed_monitoring, false);
});
test("Codex install uses only the frozen per-command source and does not rewrite global source", async t => {
  const f = fixture(t); f.plugin();
  const r = await ensureCurrent("ensure", f.args, f.options); assert.equal(r.plugin_update.state, "updated");
  const args = f.calls.find(c => c.args[1] === "add").args;
  assert.ok(args.includes('marketplaces.qdmp-marketplace.source_type="local"'));
  assert.ok(args.some(a => a.startsWith('marketplaces.qdmp-marketplace.source="') && a.includes("/.qdmp-skill/releases/")));
  assert.equal(fs.existsSync(path.join(f.config, "config.toml")), false);
});
test("personal and plugin verification share one release checkout and one cleanup", async t => {
  const f = fixture(t); f.plugin(); let downloads = 0, cleaned = 0;
  f.options.checkout = () => { downloads++; return { root: f.source, cleanup: () => cleaned++ }; };
  assert.equal((await ensureCurrent("ensure", f.args, f.options)).state, "reload_required");
  assert.equal(downloads, 1); assert.equal(cleaned, 1);
});
test("a failed release checkout is not repeated separately for each installation channel", async t => {
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
    assert.equal(result.personal_update.state, "manual_required"); assert.equal(result.plugin_update.state, "manual_required");
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
test("partial failure is explicit, not a successful reload instruction", async t => {
  const f = fixture(t); f.plugin(); f.setFail(true);
  const r = await ensureCurrent("ensure", f.args, f.options);
  assert.equal(r.state, "partial_update"); assert.equal(r.reload_required, true);
  assert.match(r.instruction, /reload alone does not resolve/); assert.equal(r.proceed_monitoring, false);
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
