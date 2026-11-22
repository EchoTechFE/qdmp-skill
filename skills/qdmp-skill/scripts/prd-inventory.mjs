#!/usr/bin/env node

import { lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAIN_PRD = "doc/prd.md";
const DOCUMENT_DIRECTORIES = new Set(["doc", "docs", "documents", "requirements", "需求", "文档"]);
const EXCLUDED = new Set([
  "node_modules", "vendor", "dist", "build", "coverage", "archive", "archives", "history",
  "__tests__", "test", "tests", "fixtures", "testdata", "examples", "samples",
]);
const DOCUMENT = /\.(?:md|markdown|mdx|txt|docx|pdf)$/iu;
const PRD_NAME = /(?:^|[^a-z0-9])prd(?:v?\d+)?(?:[^a-z0-9]|$)|product[ _-]+requirements?|产品需求|需求文档/iu;
const PRD_DIRECTORY = /^(?:prds?|product[ _-]+requirements?|产品需求|需求文档)$/iu;

export function inventoryPrds(projectRoot) {
  const root = realpathSync(projectRoot);
  const candidates = [];
  const sizes = new Map();
  const skipped = [];
  const unreadable = [];

  function visit(relativeDirectory, insidePrdDirectory = false) {
    let entries;
    try {
      entries = readdirSync(path.join(root, relativeDirectory), { withFileTypes: true });
    } catch (error) {
      if (!relativeDirectory) throw error;
      unreadable.push({ path: relativeDirectory, code: error.code });
      return;
    }
    // A standard full-stack project's frontend/qdmp.json is public config, not another app.
    const childProject = entries.some(entry => entry.name === ".git" || entry.name === "qdmp-config.json"
      || entry.name === "qdmp.json" && relativeDirectory !== "frontend");
    if (relativeDirectory && childProject) {
      skipped.push(relativeDirectory);
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        if (relative === "frontend" || DOCUMENT_DIRECTORIES.has(entry.name.toLowerCase()) || insidePrdDirectory
          || PRD_DIRECTORY.test(entry.name) || PRD_NAME.test(entry.name)) skipped.push(relative);
      } else if (entry.isDirectory() && !EXCLUDED.has(entry.name.toLowerCase())) {
        visit(relative, insidePrdDirectory || PRD_DIRECTORY.test(entry.name));
      } else if (entry.isFile() && DOCUMENT.test(entry.name) && (insidePrdDirectory || PRD_NAME.test(entry.name))) {
        candidates.push(relative);
        try {
          const stat = lstatSync(path.join(root, relative));
          if (stat.isFile()) sizes.set(relative, stat.size);
          else skipped.push(relative);
        } catch (error) {
          unreadable.push({ path: relative, code: error.code });
        }
      }
    }
  }

  visit("");
  candidates.sort();
  unreadable.sort((a, b) => a.path.localeCompare(b.path));
  return { projectRoot: root, entry: sizes.has(MAIN_PRD) ? MAIN_PRD : null, candidates,
    sizeBytesByPath: Object.fromEntries(candidates.filter(file => sizes.has(file)).map(file => [file, sizes.get(file)])),
    skipped: skipped.sort(), unreadable };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const [, , flag, projectRoot, ...extra] = process.argv;
    if (flag !== "--cwd" || !projectRoot || extra.length) throw new Error("用法：node prd-inventory.mjs --cwd <项目根目录>");
    console.log(JSON.stringify(inventoryPrds(projectRoot), null, 2));
  } catch (error) {
    console.error(`PRD 盘点失败：${error.message}`);
    process.exitCode = 1;
  }
}
