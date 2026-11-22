// Kept in sync with qdmp-cli/utils/cliUpdate.mjs for bootstrapping older CLIs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const registry = "https://registry.npmjs.org/";
const packageSpec = "qdmp-cli@latest";
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function npm(args, timeout) {
  const bin = path.dirname(process.execPath);
  const windows = process.platform === "win32";
  const executable = windows ? process.execPath : path.join(bin, "npm");
  const entry = windows ? path.join(bin, "node_modules/npm/bin/npm-cli.js") : real(executable);
  const javascript = entry?.endsWith(".js");
  return execFileSync(javascript ? process.execPath : executable, [...(javascript ? [entry] : []), ...args], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  }).trim();
}

function real(file) {
  try { return fs.realpathSync(file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

function installedVersion(root) {
  const manifest = path.join(root, "package.json");
  if (!fs.existsSync(manifest)) return undefined;
  const { name, version, bin } = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (name !== "qdmp-cli" || typeof version !== "string" || bin?.["qdmp-cli"] !== "index.js") {
    throw new Error("无法确认当前 npm 全局目录中的 qdmp-cli 安装");
  }
  return version;
}

function verifyPath(root, bin, allowMissing) {
  const windows = process.platform === "win32";
  const names = windows ? ["qdmp-cli.exe", "qdmp-cli.cmd", "qdmp-cli.bat"] : ["qdmp-cli"];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.resolve(dir, name);
      if (!fs.existsSync(candidate)) continue;
      if (!windows && real(candidate) === real(path.join(root, "index.js"))) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return;
      }
      if (windows && name === "qdmp-cli.cmd" && real(path.dirname(candidate)) === real(bin)
        && /[\\/]node_modules[\\/]qdmp-cli[\\/]index\.js/i.test(fs.readFileSync(candidate, "utf8"))) return;
      throw new Error("PATH 中的 qdmp-cli 来自其他安装目录，请切换到该 CLI 所用的 Node/npm 环境");
    }
  }
  if (!allowMissing || !dirs.some(dir => real(dir) && real(dir) === real(bin))) {
    throw new Error("当前 npm 全局命令目录不在 PATH 中");
  }
}

export function ensureLatestCli({ runningRoot, runNpm = npm } = {}) {
  const globalRoot = runNpm(["root", "--global"], 10_000);
  if (!path.isAbsolute(globalRoot)) throw new Error("无法确定 npm 全局安装目录");
  const root = path.join(globalRoot, "qdmp-cli");
  const entry = path.join(root, "index.js");
  const bin = process.platform === "win32" ? path.dirname(globalRoot) : path.resolve(globalRoot, "../../bin");
  if (runningRoot) {
    if (real(root) !== real(runningRoot)) return { state: "unmanaged" };
  } else {
    verifyPath(root, bin, true);
  }
  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) {
    throw new Error("当前 qdmp-cli 通过链接安装，请通过原渠道更新");
  }

  const online = [`--registry=${registry}`, "--prefer-online", "--offline=false", "--fetch-retries=0", "--fetch-timeout=15000"];
  const getLatest = () => {
    // A fresh cache prevents npm from falling back to stale registry metadata.
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-cli-latest-"));
    try {
      const value = JSON.parse(runNpm(["view", packageSpec, "version", "--json", ...online, `--cache=${cache}`], 20_000));
      const version = Array.isArray(value) && value.length === 1 ? value[0] : value;
      if (typeof version !== "string" || !stable.test(version)) throw new Error("npm latest 未返回有效的正式版本");
      return version;
    } finally {
      fs.rmSync(cache, { recursive: true, force: true });
    }
  };
  const lock = path.join(globalRoot, ".qdmp-cli-update.lock");
  const locked = () => new Error(`qdmp-cli 更新锁已存在，请等待其他更新完成。若上次更新异常退出，请确认后移除 ${lock}`);
  if (fs.existsSync(lock)) throw locked();
  const before = installedVersion(root);
  const latest = getLatest();
  if (before === latest) {
    if (fs.existsSync(lock)) throw locked();
    if (!fs.existsSync(entry)) throw new Error("qdmp-cli 安装缺少入口，请重新安装 qdmp-cli@latest");
    if (!runningRoot) verifyPath(root, bin, false);
    return { state: "current", version: before, latest, entry };
  }

  fs.mkdirSync(globalRoot, { recursive: true });
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === "EEXIST") throw locked();
    throw error;
  }
  try {
    const current = installedVersion(root);
    if (current !== latest) {
      runNpm(["install", "--global", packageSpec, "--include=optional", "--engine-strict", ...online], 180_000);
    }
    const version = installedVersion(root);
    const published = getLatest();
    if (version !== published || !fs.existsSync(entry)) {
      throw new Error("更新后的 qdmp-cli 未达到 npm latest，请重试");
    }
    if (!runningRoot) verifyPath(root, bin, false);
    return { state: "updated", version, latest: published, entry };
  } finally {
    fs.rmdirSync(lock);
  }
}
