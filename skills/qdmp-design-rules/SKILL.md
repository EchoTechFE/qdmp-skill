---
name: qdmp-design-rules
description: "千岛小程序 Taro 设计与前端落地规范。Use when designing QDMP mini app pages, creating or updating DESIGN.md, porting HTML designs to Taro Vue, reviewing page UI/CSS, or maintaining app.css design tokens and component classes."
allowed-tools: [Read, Grep, Glob, Bash]
user-invocable: true
---

# 千岛小程序设计规范

本 skill 维护千岛小程序 Taro 前端设计、设计系统、HTML 到 Taro 移植和页面审查规范。产品底线由 `/qdmp:qdmp-product-rules` 维护；不要把产品判断写进本 skill。

本规范参考并内置自 `qdmp-taro-design`：

- `SKILL.md`
- `references/design-workflows.md`
- `references/design-spec.md`
- `references/taro-code-spec.md`
- `references/port-guide.md`

## 参考文档路由

按任务读取最少必要文档：

| 任务 | 必读 |
| ---- | ---- |
| 页面设计、设计确认、增量页面开发、审查 | [design-workflows.md](./references/design-workflows.md) |
| 生成或反向提取 `DESIGN.md`，同步 `app.css` token/组件类 | [design-spec.md](./references/design-spec.md) |
| 编写或审查 Taro Vue/CSS、维护 `app.css` token/组件类 | [taro-code-spec.md](./references/taro-code-spec.md) |
| 把 `design/*.html` 移植成 Taro 页面 | [port-guide.md](./references/port-guide.md) 和 [taro-code-spec.md](./references/taro-code-spec.md) |

## 使用前检查

1. 确认 `projectRoot`。
2. 修改 `frontend/` 前，读取 `frontend/README.md`（如果存在）。
3. 修改页面 UI 前，读取 `{projectRoot}/DESIGN.md`（如果存在）。
4. 若没有 `DESIGN.md`：
   - 全新页面或成块 UI 开发：按 [design-workflows.md](./references/design-workflows.md) 先设计或从现有页面提取设计系统。
   - 旧项目小改：按现有页面和 `app.css` 保持一致，不凭空引入一套新 token。

## 核心原则

- 设计系统不能凭空生成；只能来自用户确认的 HTML 设计页面，或现有 Taro 页面与 `app.css` 的反向提取。
- HTML 设计先于复杂 Taro 构图；Taro 负责像素级落地，不重新设计。
- `app.css` 是设计系统唯一代码来源：`:root` token + 公共组件类。
- 写 Taro 时优先复用 token 和具名 class；不要用元素选择器，不要散落硬编码颜色、字号、圆角、阴影。
- 需要复用的新元素先沉淀为 `app.css` 公共类并同步 `DESIGN.md`；只出现一次的几何布局可留在页面局部样式。
- 移植完成后必须渲染验真；能截图就和 HTML 原稿并排比对，改到观感看不出差别。

## 与主 qdmp skill 的关系

`/qdmp:qdmp-skill` 在前端页面、组件、样式、设计系统、UI Review 任务中依赖本 skill。先用 `/qdmp:qdmp-product-rules` 校验产品边界，再用本 skill 落地视觉与 Taro 代码。
