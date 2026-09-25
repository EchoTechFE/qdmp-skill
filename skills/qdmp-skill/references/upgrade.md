# 旧版本升级与已有项目检查

本流程基础能力要求 qdmp-skill 1.1.4 和 qdmp-cli 0.1.29 或更高兼容稳定版。真机扫码调试和设置体验版要求 qdmp-cli ≥0.1.32，新入口说明包含在 qdmp-skill 1.1.7 中。先正式发布再引导安装；安装失败不能退回 1.0 模板。磁盘更新不会自动替换当前会话已加载的 Skill，更新后重新加载或开启新会话。

## CLI

先记录 node --version、qdmp-cli --version、npm prefix -g 和实际命令路径（macOS/Linux 用 command -v qdmp-cli，Windows 用 where qdmp-cli）。多套 NVM 环境可能各有旧安装，在实际开发环境更新：

```bash
npm install -g qdmp-cli@0.1.32 --include=optional
qdmp-cli --version
qdmp-cli list
```

仅需干净重装时先执行 npm uninstall -g qdmp-cli；不要清空整个 npm 缓存、Node.js 目录、账号配置或项目。切换 Node.js 后重新验证命令路径。原生依赖安装失败应修复环境，不能跳过安装脚本或 EMP 编译。较新 npm 若提示安装脚本被策略阻止，按其提示仅允许本次必要脚本（qdmp-cli、esbuild、@parcel/watcher），不要全局放开脚本。安装后执行包内 utils/compilerRuntime.js 验证原生依赖，不能只检查 --version。

## Skill

按原安装渠道更新完整 QDMP 插件/Skill 组，包括 knowledge、references、scripts，不只替换 SKILL.md。插件市场用户先刷新市场再更新插件；手动复制或 Skills CLI 用户按原渠道重新安装完整目录。核对实际加载来源，移除已确认的同名旧安装，不删除项目或其他插件。基础流程确认版本至少为 1.1.4；需要新真机调试和体验版说明时更新至 1.1.7 或更高版本，再重新加载或新建会话。

旧 Skill 不会主动获得新规则。发布方必须在公开入门文档、升级通知和支持入口提供升级说明；离线或不访问新入口的用户不能被视为已升级。不能靠服务端文档为旧客户端补上保护逻辑。

## 已有工程

- 更新工具不自动重建项目、修改 AppID 或平台类型。
- package.json.version、SDK 版本和通用依赖不是小程序代际判据。
- EMP 工程丢失 loader：核对模板、实际构建链和平台后恢复字段，不把 SPA 硬改为 EMP。
- 本地或平台不是 EMP：停止操作，仅允许关联 EMP 应用并使用 2.0 工程。
- SPA/effuse/echo-effuse/effues 工程不受支持，不提供旧版开发、构建或上传路径。保留原工程，在独立的官方 2.0 模板中迁移业务并验证后再继续。
- 本地开发、开发版本上传和体验版验证统一使用正式开放平台同一个 appId，无需额外配置应用 ID。
- 在前端目录执行 getMe 核对应用；2.0 必须完成 qdmp build 的 EMP 编译。分别记录安装、构建和真机验证结果。
