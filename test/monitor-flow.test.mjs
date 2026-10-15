import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
const skill = fileURLToPath(new URL("../skills/qdmp-skill/", import.meta.url));
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-flow-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "skill"); fs.cpSync(skill, installed, { recursive: true });
  const cwd = path.join(root, "目录 空格"); fs.mkdirSync(cwd);
  const manifestFile = path.join(installed, "references/telemetry-distribution.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const content = Buffer.from("// pinned test entry, never executed\n");
  manifest.onboarding.sha256 = hash(content);
  manifest.pre_download_notice.onboarding_sha256 = hash(content);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const api = await import(path.join(installed, "scripts/monitor-flow.mjs"));
  let mode = "missing", granted = false, hook = "hooks_pending", mutate = x => x, installs = 0, calls = 0, downloads = 0;
  const notice = () => {
    const choice = { action: mode === "missing" ? "install" : "reuse", target_version: manifest.version,
      expected_version: mode === "missing" ? null : manifest.version,
      authorization_version: mode === "missing" ? "install-monitor-production-v1" : "monitor-production-v1",
      permissions: [...(mode === "missing" ? ["install"] : []), "monitor_current_workspace", "production_upload"] };
    choice.argv = ["enable", "--cwd", cwd, "--host", "codex", "--accept-monitoring", "--exact-workspace", "--authorization-version", choice.authorization_version,
      ...(mode === "missing" ? [] : ["--expected-version", manifest.version])];
    return mutate({ project_root: cwd, host: "codex", exact_workspace: true,
      upload_endpoint: manifest.pre_download_notice.upload_endpoint, legal: manifest.pre_download_notice.legal,
      distribution: manifest, status: { plugin_state: mode, installed_version: choice.expected_version,
        recommended_version: manifest.version, compatible: mode === "installed", project: { granted }, installation: { root: mode === "missing" ? null : "/verified/runtime" } },
      choices: mode === "unknown" ? [] : [choice] });
  };
  const options = { homeDir: path.join(root, "home"), download: async () => { downloads++; return content; }, run: (_entry, argv) => {
    calls++;
    if (argv[0] === "help") return { usage: "--exact-workspace" };
    if (argv[0] === "notice") return notice();
    if (argv[0] === "enable") { installs++; mode = "installed"; granted = true; return { state: "hooks_pending" }; }
    if (argv[0] === "status") return { project_root: cwd, host: "codex", installed_version: manifest.version, compatible: true, project: { granted, state: hook } };
    throw new Error("unexpected subprocess");
  } };
  const start = () => api.monitorFlow("begin", { cwd, host: "codex" }, options);
  const action = (s, cmd, args = {}) => api.monitorFlow(cmd, { flow: s.id, ...args }, options);
  const approve = s => action(s, "authorize", { decision: "approve", digest: s.disclosure_digest });
  const ready = async () => { const s = await start(); await approve(s); await action(s, "fetch"); await action(s, "inspect"); return s; };
  return { root, cwd, installed, manifestFile, manifest, content, api, options, start, action, approve, ready,
    counts: () => ({ installs, calls, downloads }), setMode: x => { mode = x; }, setHook: x => { hook = x; }, mutate: fn => { mutate = fn; } };
}
test("happy cold start enforces every step and distinguishes Hook from warehouse proof", async t => {
  const f = await fixture(t); const s = await f.start();
  assert.match(s.disclosure.legal, /^\s*# Agent 授权询问文案/);
  assert.match(s.disclosure.display, /## 1\. Agent 授权询问文案/);
  assert.match(s.disclosure.display, /https:\/\/open\.qiandao\.com\/docs\/skill-data-collection/);
  assert.doesNotMatch(s.disclosure.display, /## 2\. 使用数据说明/);
  assert.match(s.instruction, /Show only disclosure\.display/);
  assert.match(s.instruction, /Do not print disclosure\.consent/);
  assert.match(s.instruction, /Ask for one explicit decision/);
  assert.deepEqual(f.counts(), { installs: 0, calls: 0, downloads: 0 });
  assert.deepEqual(fs.readdirSync(f.cwd), []);
  assert.equal((await f.approve(s)).state, "authorized");
  assert.equal((await f.action(s, "fetch")).state, "entry_verified");
  assert.equal((await f.action(s, "inspect")).state, "choice_ready");
  const activated = await f.action(s, "execute");
  assert.equal(activated.state, "activation_reported");
  assert.match(activated.instruction, /do not authorize plugin Hooks/);
  const pending = await f.action(s, "verify");
  assert.equal(pending.state, "verification_pending");
  assert.match(pending.instruction, /Settings > Hooks.*trust agent-runtime-telemetry/);
  assert.ok(pending.instruction.indexOf("trust agent-runtime-telemetry") < pending.instruction.indexOf("restart Codex Desktop"));
  f.setHook("collecting"); const done = await f.action(s, "verify");
  assert.equal(done.state, "collecting"); assert.equal(done.warehouse, "not_verified");
  assert.equal(f.counts().installs, 1);
  await assert.rejects(f.action(s, "execute"), /invalid transition/);
});
test("empty or incomplete project keeps directory authorization until activation", async t => {
  const f = await fixture(t); const s = await f.ready();
  assert.deepEqual(fs.readdirSync(f.cwd), []);
  assert.equal((await f.action(s, "status")).state, "choice_ready");
  fs.writeFileSync(path.join(f.cwd, "qdmp-config.json"), JSON.stringify({ name: "unfinished" }));
  assert.equal((await f.action(s, "status")).directory, f.cwd);
  assert.equal((await f.action(s, "execute")).state, "activation_reported");
  assert.equal(f.counts().installs, 1);
});
test("out-of-order fetch/execute and unbound assent cannot invoke network or installer", async t => {
  const f = await fixture(t); const s = await f.start();
  await assert.rejects(f.action(s, "fetch"), /invalid transition/);
  await assert.rejects(f.action(s, "execute"), /invalid transition/);
  await assert.rejects(f.action(s, "authorize", { decision: "approve", digest: "wrong" }), /explicit decision/);
  await assert.rejects(f.action(s, "authorize", { digest: s.disclosure_digest }), /explicit decision/);
  assert.deepEqual(f.counts(), { installs: 0, calls: 0, downloads: 0 });
});
test("decline persists a terminal state without any network call", async t => {
  const f = await fixture(t); const s = await f.start();
  assert.equal((await f.action(s, "authorize", { decision: "decline", digest: s.disclosure_digest })).state, "declined");
  await assert.rejects(f.action(s, "fetch"), /invalid transition/);
  assert.equal(f.counts().downloads, 0);
});
test("changed manifest or replaced directory invalidates authorization", async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s);
  fs.renameSync(f.cwd, f.cwd + "-old"); fs.mkdirSync(f.cwd);
  await assert.rejects(f.action(s, "fetch"), /directory identity/);
  const newFlow = await f.start(); await f.approve(newFlow);
  fs.writeFileSync(f.manifestFile, JSON.stringify({ ...f.manifest, artifact_url: "https://example.com/changed.tgz" }));
  await assert.rejects(f.action(newFlow, "fetch"), /release or disclosure changed/);
  assert.equal(f.counts().downloads, 0);
});
test("hash mismatch blocks external execution before and after verified download", async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s);
  const original = f.options.download; f.options.download = async () => Buffer.from("tampered");
  await assert.rejects(f.action(s, "fetch"), /checksum/);
  assert.equal(f.counts().calls, 0);
  f.options.download = original; await f.action(s, "fetch");
  fs.writeFileSync(path.join(f.options.homeDir, ".qdmp-skill/monitor-flows", s.id, "onboarding.mjs"), "tampered");
  await assert.rejects(f.action(s, "inspect"), /checksum/);
  assert.equal(f.counts().calls, 0);
});
test("live inventory changes between choice and execution stop mutation", async t => {
  const f = await fixture(t); const s = await f.ready(); f.setMode("installed");
  assert.equal((await f.action(s, "execute")).state, "needs_reconfirmation");
  assert.equal(f.counts().installs, 0);
});
for (const [name, mutate] of [
  ["directory", n => ({ ...n, project_root: "/different" })],
  ["endpoint", n => ({ ...n, upload_endpoint: "https://dev-c.qiandao.com/collect" })],
  ["legal", n => ({ ...n, legal: "shortened" })],
  ["version", n => ({ ...n, distribution: { ...n.distribution, version: "99.0.0" } })]
]) test(`central ${name} drift is rejected`, async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s); await f.action(s, "fetch"); f.mutate(mutate);
  await assert.rejects(f.action(s, "inspect"), /mismatch/); assert.equal(f.counts().installs, 0);
});
for (const [name, mutate] of [
  ["cross-directory argv", n => { n.choices[0].argv[2] = "/other"; return n; }],
  ["source override", n => { n.choices[0].argv.push("--repository-source", "/tmp/source"); return n; }],
  ["update", n => { n.choices[0].action = "update"; return n; }],
  ["extra permissions", n => { n.choices[0].permissions.push("update"); return n; }],
  ["wrong expected version", n => { n.choices[0].argv.push("--expected-version", "9.0.0"); return n; }]
]) test(`${name} cannot execute`, async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s); await f.action(s, "fetch"); f.mutate(mutate);
  assert.equal((await f.action(s, "inspect")).state, "needs_reconfirmation"); assert.equal(f.counts().installs, 0);
});
test("same-version compatible reuse is allowed; unknown state is not missing", async t => {
  const f = await fixture(t); f.setMode("installed"); const s = await f.ready();
  assert.equal((await f.action(s, "status")).choice.action, "reuse");
  assert.equal((await f.action(s, "execute")).state, "activation_reported");
  f.setMode("unknown"); const another = await f.start(); await f.approve(another); await f.action(another, "fetch");
  assert.equal((await f.action(another, "inspect")).state, "needs_reconfirmation");
});
test("ambiguous mutation failure cannot be replayed; status/verification remain available", async t => {
  const f = await fixture(t); const s = await f.ready(); const original = f.options.run;
  f.options.run = (...args) => { if (args[1][0] === "enable") throw new Error("host approval denied"); return original(...args); };
  assert.equal((await f.action(s, "execute")).state, "failed");
  await assert.rejects(f.action(s, "execute"), /invalid transition/);
  assert.equal((await f.action(s, "status")).reason, "host approval denied");
});
test("concurrent operation holds lock and CLI forbids overriding bound scope", async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s);
  let resolve; f.options.download = () => new Promise(r => { resolve = r; });
  const pending = f.action(s, "fetch");
  await assert.rejects(f.action(s, "fetch"), /busy/);
  resolve(f.content); await pending;
  await assert.rejects(f.api.runFlow(["execute", "--flow", s.id, "--cwd", "/other"], f.options), /unknown/);
  await assert.rejects(f.api.runFlow(["status", "--flow", "../outside"], f.options), /valid flow/);
});
test("list and status restore only this directory/host without performing actions", async t => {
  const f = await fixture(t); const s = await f.start(); await f.approve(s);
  const listed = await f.api.runFlow(["list", "--cwd", f.cwd, "--host", "codex"], f.options);
  assert.deepEqual(listed.flows.map(x => x.id), [s.id]);
  assert.equal((await f.api.runFlow(["status", "--flow", s.id], f.options)).state, "authorized");
  assert.deepEqual((await f.api.runFlow(["list", "--cwd", f.cwd, "--host", "qoder"], f.options)).flows, []);
  assert.equal(f.counts().downloads, 0); assert.equal(f.counts().calls, 0);
});
test("already granted live project goes to verification without duplicate activation", async t => {
  const f = await fixture(t); const previous = await f.ready(); await f.action(previous, "execute");
  const another = await f.start(); await f.approve(another); await f.action(another, "fetch");
  assert.equal((await f.action(another, "inspect")).state, "verification_pending");
  await assert.rejects(f.action(another, "execute"), /invalid transition/);
  assert.equal(f.counts().installs, 1);
});
