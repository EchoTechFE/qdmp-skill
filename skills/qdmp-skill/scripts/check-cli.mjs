import { execFileSync } from 'node:child_process';
const required = process.argv[2] || '0.1.29';
try {
  if (!/^\d+\.\d+\.\d+$/.test(required)) throw new Error('最低版本参数必须为 x.y.z');
  const minimum = required.split('.').map(Number);
  const output = execFileSync('qdmp-cli', ['--version'], { encoding: 'utf8', timeout: 15000 }).replace(/\x1b\[[0-9;]*m/g, '').trim();
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\+[^\s]+)?$/.exec(output);
  if (!match) throw new Error('无法确认稳定版 CLI 版本：' + output);
  const diff = match.slice(1).map((n, i) => Number(n) - minimum[i]).find(n => n !== 0) ?? 0;
  if (diff < 0) throw new Error(`CLI ${output} 低于本流程要求的 ${required}`);
  console.log(`CLI ${output} 通过版本检查；还需检查模板与本地/平台 loader。`);
} catch (error) {
  console.error(`${error.message}\n请安装已发布的 qdmp-cli@${required} 或更高稳定版（包含 optional 依赖），并在同一 Node.js 环境重新检查。无法安装时停止依赖新版能力的操作，不回退旧模板。`);
  process.exitCode = 1;
}
