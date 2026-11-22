import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inventoryPrds } from "../skills/qdmp-skill/scripts/prd-inventory.mjs";

async function fixture(t, paths) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qdmp-prd-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of paths) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "fixture");
  }
  return root;
}

test("finds historical PRD paths without claiming a canonical entry exists", async t => {
  const root = await fixture(t, [
    "qdmp.json", "PRD.md", "docs/PRD-v3.md", "docs/产品需求_旧版.docx", "frontend/qdmp.json",
    "frontend/doc/prdV2.markdown", "prd/catalog.md", "doc/design.md", "doc/archive/prd/PRD.md",
  ]);
  const result = inventoryPrds(root);
  assert.equal(result.entry, null);
  assert.deepEqual(result.candidates, [
    "PRD.md", "docs/PRD-v3.md", "docs/产品需求_旧版.docx", "frontend/doc/prdV2.markdown", "prd/catalog.md",
  ]);
});

test("inventories the canonical entry and excludes nested apps, archives, builds and symlinks", async t => {
  const root = await fixture(t, [
    "qdmp-config.json", "doc/prd.md", "doc/prd-catalog.md", "doc/archive/prd/docs/PRD.md",
    "dist/doc/prd.md", "node_modules/x/prd.md", "examples/prd.md", ".hidden/prd.md",
    "demo/qdmp-config.json", "demo/doc/prd.md", "old-app/qdmp.json", "old-app/PRD.md",
    "subrepo/.git/HEAD", "subrepo/prd.md", "worktree/.git", "worktree/doc/prd.md",
  ]);
  await symlink(path.join(root, "demo"), path.join(root, "prds"));
  await symlink(path.join(root, "demo"), path.join(root, "docs"));
  await symlink(path.join(root, "demo"), path.join(root, "frontend"));
  await symlink(path.join(root, "demo/doc/prd.md"), path.join(root, "doc/prd-linked.md"));
  const result = inventoryPrds(root);
  assert.equal(result.entry, "doc/prd.md");
  assert.deepEqual(result.candidates, ["doc/prd-catalog.md", "doc/prd.md"]);
  assert.deepEqual(result.skipped, ["demo", "doc/prd-linked.md", "docs", "frontend", "old-app", "prds", "subrepo", "worktree"]);
  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(inventoryPrds(root), result);
});

test("reports byte size for each candidate without treating artifacts or redirects as active requirements", async t => {
  const root = await fixture(t, ["doc/prd.md", "docs/PRD.md", "doc/archive/prd/old.md", "docs/PRD.pdf"]);
  const prd = "# 现行需求\n";
  const redirect = "[现行需求](../doc/prd.md)\n";
  await writeFile(path.join(root, "doc/prd.md"), prd);
  await writeFile(path.join(root, "docs/PRD.md"), redirect);
  const result = inventoryPrds(root);
  assert.deepEqual(result.sizeBytesByPath, {
    "doc/prd.md": Buffer.byteLength(prd),
    "docs/PRD.md": Buffer.byteLength(redirect),
    "docs/PRD.pdf": 7,
  });
});
