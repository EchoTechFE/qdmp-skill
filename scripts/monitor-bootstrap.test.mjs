import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectHost, installTelemetry, prepareTelemetryArtifact, resolveCodexCommand, resolveHostInstaller } from "./monitor-bootstrap.mjs";

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function artifactFixture() {
  const content = Buffer.from("verified telemetry artifact");
  const release = {
    version: "0.2.1",
    artifact_url: "https://downloads.example.test/agent-runtime-telemetry-0.2.1.tar.gz",
    artifact_sha256: crypto.createHash("sha256").update(content).digest("hex"),
    archive_root: "agent-runtime-telemetry-0.2.1",
    repository_source: "",
    repository_ref: "",
    marketplace_name: "agent-runtime-telemetry-marketplace",
    plugin_name: "agent-runtime-telemetry"
  };
  const fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => String(content.length) },
    arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
  });
  return { content, release, fetch };
}

function artifactSpawn(release, commands = []) {
  return (command, args) => {
    commands.push([command, ...args]);
    if (command !== "tar") throw new Error(`unexpected command: ${command}`);
    if (args[0] === "-tzf") {
      return { status: 0, stdout: [
        `${release.archive_root}/`,
        ...[".codex-plugin", ".qoder-plugin", ".claude-plugin", ".cursor-plugin", ".codebuddy-plugin", ".workbuddy-plugin"].map((directory) => `${release.archive_root}/${directory}/plugin.json`),
        `${release.archive_root}/.codex-plugin/marketplace.json`,
        `${release.archive_root}/.agents/plugins/marketplace.json`
      ].join("\n"), stderr: "" };
    }
    if (args[0] === "-tvzf") {
      return { status: 0, stdout: `drwxr-xr-x user/group 0 date ${release.archive_root}/\n-rw-r--r-- user/group 1 date ${release.archive_root}/.codex-plugin/plugin.json\n`, stderr: "" };
    }
    if (args[0] === "-xzf") {
      const extractRoot = args[args.indexOf("-C") + 1];
      const root = path.join(extractRoot, release.archive_root);
      for (const directory of [".codex-plugin", ".qoder-plugin", ".claude-plugin", ".cursor-plugin", ".codebuddy-plugin", ".workbuddy-plugin"]) {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
        fs.writeFileSync(path.join(root, directory, "plugin.json"), JSON.stringify({ name: release.plugin_name, version: release.version }));
      }
      fs.writeFileSync(path.join(root, ".codex-plugin", "marketplace.json"), JSON.stringify({ name: release.marketplace_name, plugins: [] }));
      fs.mkdirSync(path.join(root, ".agents", "plugins"), { recursive: true });
      fs.writeFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), JSON.stringify({ name: release.marketplace_name, plugins: [] }));
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error(`unexpected tar arguments: ${args.join(" ")}`);
  };
}

test("monitor bootstrap prefers the desktop Codex runtime", () => {
  const desktop = "/Applications/Codex.app/Contents/Resources/codex";
  assert.equal(resolveCodexCommand({
    platform: "darwin",
    homeDir: "/Users/tester",
    existsSync: (candidate) => candidate === desktop
  }), desktop);
});

test("monitor bootstrap preserves an explicit command override", () => {
  assert.equal(resolveCodexCommand({ codexCommand: "/custom/codex" }), "/custom/codex");
});

test("monitor bootstrap detects Claude Code and Qoder host environments", () => {
  assert.equal(detectHost({}, { env: { CLAUDE_PLUGIN_ROOT: "/plugin" } }), "claude-code");
  assert.equal(detectHost({}, { env: { QODER_PLUGIN_ROOT: "/plugin" } }), "qoder");
  assert.equal(detectHost({ host: "codex" }, { env: { QODER_PLUGIN_ROOT: "/plugin" } }), "codex");
});

test("Qoder prefers its plugin CLI and falls back to the desktop executable", () => {
  assert.deepEqual(resolveHostInstaller("qoder", {
    qoderCliCommand: "/custom/qoderclicn",
    commandExists: (command) => command === "/custom/qoderclicn"
  }), { host: "qoder", mode: "plugin_cli", command: "/custom/qoderclicn" });
  assert.deepEqual(resolveHostInstaller("qoder", {
    platform: "darwin",
    commandExists: () => false,
    existsSync: (candidate) => candidate === "/Applications/Qoder IDE.app/Contents/Resources/app/bin/qoder"
  }), { host: "qoder", mode: "desktop_mcp", command: "/Applications/Qoder IDE.app/Contents/Resources/app/bin/qoder" });
});

test("verified telemetry artifacts are downloaded, checked, safely extracted, and cached", async () => {
  const homeDir = tempDir("qdmp-telemetry-home");
  const fixture = artifactFixture();
  const commands = [];
  const first = await prepareTelemetryArtifact(fixture.release, {
    homeDir,
    fetch: fixture.fetch,
    spawn: artifactSpawn(fixture.release, commands)
  });
  assert.equal(first.cached, false);
  assert.equal(fs.existsSync(path.join(first.plugin_root, ".codex-plugin", "plugin.json")), true);
  assert.equal(fs.existsSync(path.join(first.plugin_root, ".claude-plugin", "marketplace.json")), true);
  assert.equal(fs.existsSync(path.join(first.plugin_root, ".qoder-plugin", "marketplace.json")), true);
  assert.deepEqual(commands.map((command) => command[1]), ["-tzf", "-tvzf", "-xzf"]);

  const second = await prepareTelemetryArtifact(fixture.release, {
    homeDir,
    fetch: async () => { throw new Error("cached artifacts must not be downloaded again"); },
    spawn: () => { throw new Error("cached artifacts must not be extracted again"); }
  });
  assert.equal(second.cached, true);
  assert.equal(second.plugin_root, first.plugin_root);
});

test("telemetry artifact checksum mismatches fail before extraction", async () => {
  const fixture = artifactFixture();
  await assert.rejects(
    prepareTelemetryArtifact({ ...fixture.release, artifact_sha256: "0".repeat(64) }, {
      homeDir: tempDir("qdmp-telemetry-bad-hash"),
      fetch: fixture.fetch,
      spawn: () => { throw new Error("tar must not run for an invalid checksum"); }
    }),
    /checksum mismatch/
  );
});

test("telemetry artifacts reject traversal paths", async () => {
  const fixture = artifactFixture();
  await assert.rejects(
    prepareTelemetryArtifact(fixture.release, {
      homeDir: tempDir("qdmp-telemetry-traversal"),
      fetch: fixture.fetch,
      spawn: () => ({ status: 0, stdout: `${fixture.release.archive_root}/../escape\n`, stderr: "" })
    }),
    /unsafe telemetry artifact path/
  );
});

test("artifact install replaces an old Git marketplace with the verified local source", async () => {
  const fixture = artifactFixture();
  const homeDir = tempDir("qdmp-telemetry-install-home");
  const project = tempDir("qdmp-telemetry-project");
  const calls = [];
  const tar = artifactSpawn(fixture.release, calls);
  const spawn = (command, args) => {
    if (command === "tar") return tar(command, args);
    calls.push([command, ...args]);
    if (args.join(" ") === "plugin marketplace list --json") {
      return { status: 0, stdout: JSON.stringify({ marketplaces: [{
        name: fixture.release.marketplace_name,
        marketplaceSource: { sourceType: "git", source: "https://g.echo.tech/qdminiapp/agent-runtime-telemetry" }
      }] }), stderr: "" };
    }
    return { status: 0, stdout: "{}", stderr: "" };
  };
  const result = await installTelemetry({ cwd: project, accepted: true }, {
    homeDir,
    codexCommand: "/desktop/codex",
    distribution: fixture.release,
    fetch: fixture.fetch,
    spawn
  });
  assert.equal(result.distribution_mode, "verified_artifact");
  assert.equal(result.status, "installed_restart_required");
  assert.ok(calls.some((call) => call.join(" ").includes("plugin marketplace remove agent-runtime-telemetry-marketplace")));
  assert.ok(calls.some((call) => call[0] === "/desktop/codex" && call[1] === "plugin" && call[3] === "add" && call[4] === result.local_source));
  assert.ok(calls.some((call) => call.join(" ").includes("plugin add agent-runtime-telemetry@agent-runtime-telemetry-marketplace")));
});

test("Claude Code installs the verified artifact with its native plugin CLI", async () => {
  const fixture = artifactFixture();
  const calls = [];
  const tar = artifactSpawn(fixture.release, calls);
  const spawn = (command, args) => {
    if (command === "tar") return tar(command, args);
    calls.push([command, ...args]);
    if (args.join(" ") === "plugin marketplace list --json") return { status: 0, stdout: "[]", stderr: "" };
    return { status: 0, stdout: "ok", stderr: "" };
  };
  const result = await installTelemetry({ cwd: tempDir("qdmp-claude-project"), accepted: true, host: "claude-code" }, {
    homeDir: tempDir("qdmp-claude-home"),
    distribution: fixture.release,
    fetch: fixture.fetch,
    spawn,
    hostInstaller: { host: "claude-code", mode: "plugin_cli", command: "/desktop/claude" }
  });
  assert.equal(result.host, "claude-code");
  assert.ok(calls.some((call) => call[0] === "/desktop/claude" && call[1] === "plugin" && call[3] === "add"));
  assert.ok(calls.some((call) => call.join(" ") === "/desktop/claude plugin install agent-runtime-telemetry@agent-runtime-telemetry-marketplace"));
});

test("Qoder Desktop installs the verified artifact MCP without qoderclicn", async () => {
  const fixture = artifactFixture();
  const calls = [];
  const tar = artifactSpawn(fixture.release, calls);
  const spawn = (command, args) => {
    if (command === "tar") return tar(command, args);
    calls.push([command, ...args]);
    return { status: 0, stdout: "ok", stderr: "" };
  };
  const result = await installTelemetry({ cwd: tempDir("qdmp-qoder-project"), accepted: true, host: "qoder" }, {
    homeDir: tempDir("qdmp-qoder-home"),
    distribution: fixture.release,
    fetch: fixture.fetch,
    spawn,
    hostInstaller: { host: "qoder", mode: "desktop_mcp", command: "/Applications/Qoder IDE.app/Contents/Resources/app/bin/qoder" }
  });
  assert.equal(result.host, "qoder");
  assert.equal(result.installer_mode, "desktop_mcp");
  const addMcp = calls.find((call) => call[0].endsWith("/qoder") && call[1] === "--add-mcp");
  assert.ok(addMcp);
  const definition = JSON.parse(addMcp[2]);
  assert.equal(definition.env.ART_HOST, "qoder");
  assert.match(definition.args[0], /scripts\/mcp\.mjs$/);
});
