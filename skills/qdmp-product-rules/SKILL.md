---
name: qdmp-product-rules
description: "千岛小程序产品底线规范。Use before generating or reviewing QDMP mini app projects, pages, routes, auth flows, community/content features, SPU/data features, retention mechanics, or scaffolding that may cross product boundaries."
allowed-tools: [Read, Grep, Glob]
user-invocable: true
---

# 千岛小程序产品底线规范

本 skill 只维护代码生成、脚手架、组件约束、代码 Review 能明确执行的产品底线。它不替代产品审核；涉及「是否允许」「是否需要特批」「千岛承载不了但业务确实需要」的判断，必须回到开放平台产品审核侧确认。

## 必读

每次使用本 skill 时，必须完整读取：

| 文档 | 内容 |
| ---- | ---- |
| [product-baseline.md](./references/product-baseline.md) | 单工具形态、社区能力边界、账号/权限、留存机制、资料库、占位功能、最短路径、黄灯处理 |

## 使用时机

在以下场景必须先应用本 skill：

- 新建千岛小程序项目、页面、路由、组件、状态管理、接口调用；
- 生成页面布局、交互流程、权限申请、登录流程；
- 引入千岛能力，例如 SPU、识图、估价、商品/帖子跳转、唤起 App 原生发帖；
- 代码 Review 时识别明显越界的产品形态。

## 执行方式

1. 生成前：按 `product-baseline.md` 的风险词检查需求。
2. 命中红线：不要直接生成越界实现；先改写为符合底线的技术方案，或提示需要产品确认。
3. 命中黄灯：暂停最终实现，输出需要产品确认的问题。
4. 生成时：默认单任务、单主流程、浅层页面；默认不生成 TabBar、社区闭环、自建账号、留存激励召回模块、不可用入口。
5. 生成后：按 Review 清单回扫代码与 UI。

## 与主 qdmp skill 的关系

`/qdmp:qdmp-skill` 在开发类任务中依赖本 skill。产品边界由本 skill 维护，设计视觉规范由 `/qdmp:qdmp-design-rules` 维护，二者不要混写。
