import { ensureLatestCli } from "./cli-update.mjs";

try {
  const { state, version } = ensureLatestCli();
  if (state === "updated") console.log(`qdmp-cli 已更新至 ${version}`);
  else console.log(`qdmp-cli ${version} 已是 npm latest`);
} catch (error) {
  console.error(`${error.message}\n请检查当前 Node/npm 环境，然后重试 npm install -g qdmp-cli@latest --include=optional。`);
  process.exitCode = 1;
}
