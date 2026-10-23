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

### 三类旧入口的诊断与自动更新

从 1.1.13 起，每次触发主 Skill 时先运行 `scripts/ensure-current.mjs ensure`。四个 Skill 可分别独立安装，因此各自携带 `references/skill-release.json` 标识版本，插件仍由三端 `plugin.json` 标识，不再另外写版本收据。只认 `EchoTechFE/qdmp-skill` 已发布且非预发布的 `vX.Y.Z`，忽略同仓库的 Telemetry Release；不把 main 分支或开发版本当成稳定发布。

“用户级独立安装的 Skill”指直接安装到用户 Skills 目录中的副本；“通过插件安装的 Skill”由 QDMP 插件提供。两者是同一套公开发布内容的不同安装渠道，不是个人版与公开版的区别；同一宿主可能同时存在两种渠道的副本。

先只读诊断（`<Skill>` 必须是本次实际加载的绝对路径，不是业务项目目录）。`copies` 包含磁盘残留副本，并不证明它们仍启用；`duplicate_installations` 仅在宿主清单确认插件已安装且用户级独立安装的 Skill 也存在时为 true，清单不可用时为 null，不能把缓存目录冒充实际安装证据：

```text
node <Skill>/scripts/ensure-current.mjs diagnose --host codex --cwd <真实工作目录> --skill-dir <Skill>
```

宿主为 Claude Code 或 Qoder 时替换为 `claude-code` / `qoder`。只查询当前宿主，不跨 IDE 推断已安装或已授权。Codex 优先识别 Desktop 内置可执行文件，包括 ChatGPT.app 中的 `codex-cli/CodexCLI.app/Contents/MacOS/codex`；必要时用 `--command <真实CLI可执行文件或JS入口>` 明确指定，不能指定另一 IDE 的命令。Windows npm `.cmd` 解析为 JS bin 直接运行，不拼接 shell。

| 原因 | 诊断证据 | 处理 |
| --- | --- | --- |
| 市场/插件缓存旧 | `latest`、`marketplace_snapshot.version`、`plugin.version` 不一致 | 同一官方市场定向刷新，再更新已安装的 qdmp；读取更新后的清单和完整 Skill 内容，不能以 CLI exit=0 当成功 |
| 独立安装与插件安装的副本并存 | `loaded_skill`、`loaded_version`、`copies` 和 `duplicate_installations` | 更新当前宿主已有的用户级独立安装 Skill 及已有插件；完整备份独立安装的 Skill 目录，完整替换 knowledge/references/scripts，已有配套 Skill 同步更新；不只更新 SKILL.md，不新增其他安装渠道。无需删除独立安装的副本来赌优先级；各渠道同版本后重新加载 |
| 旧 flow 内保存旧引导 | `flows[].current=false`、`reason`、`entry_matches_current` | 原 flow 和 onboarding 原样保留。未执行安装的旧 flow 使用新告知创建新绑定；发生过执行/失败/采集的先查当前运行时，不重放安装；旧拒绝保留，不因软件更新重新询问 |

执行自动更新：

```text
node <Skill>/scripts/ensure-current.mjs ensure --host codex --cwd <真实工作目录> --skill-dir <Skill>
```

软件更新不等于同意监控：该入口不运行 Telemetry 安装、激活、采集同意或 Hook 信任命令。监控插件仍按独立引导的实际版本和动作取得确认；软件更新不会扩大项目目录或数据范围。已完成软件更新返回 `reload_required`，先重新加载实际宿主并读取新 Skill，再处理当前目录状态；不能继续执行内存中的旧入口。

Codex 插件从正式标签的完整已校验快照安装，只对本次命令覆盖市场来源，用户长期跟踪的官方来源保持不变。安装后校验整个插件包，包括 MCP、Hook、声明、脚本和 Skill，仅排除宿主生成的 `.git`、`.codex-marketplace-install.json`、`.in_use`。Claude Code/Qoder 插件返回 `immutable_plugin_update_not_supported`，不从移动的 main 分支自动安装；两端用户级独立安装的 Skill 仍可自动更新。Qoder Desktop 无 CLI 时，仅以自己的 user registry 明确无 qdmp 来确认插件未安装，不借用其他 IDE 清单。

版本相同仍需与正式内容比较；`same_version_content_mismatch` 时保留现场，人工核对或发布新版本修复。实际加载的未托管副本也需内容一致，不能只凭版本号放行。配套 Skill 逐个检查，已知更高版本保留、禁止降级。项目级插件按宿主项目范围匹配，进入子目录不会误判未安装；非 user 范围仍不自动更改。同一次检查共用一份发布源码快照，避免按安装渠道重复下载；Codex 的固定安装快照保存在 `.qdmp-skill/releases/`。

部分渠道成功、其他渠道失败时返回 `partial_update`，并单独报告 `reload_required`。重新加载成功的渠道不能消除失败渠道的问题；此时 `proceed_monitoring=false`，不能以“重启即可”冒充更新完成。

以下情况停止自动变更相应渠道并返回 `manual_required`：自定义/本地开发市场、固定 ref、禁用插件、多个活动安装范围、非 user 范围、符号链接、安装状态不明、CLI 不支持更新。没有安装的渠道不自动安装。网络不可用返回 `release_check_failed`，不执行过期监控引导，但不阻断原业务和已授权运行时。

线上版本检查优先通过 GitHub API 查询稳定 Release，并从选中的同一标签读取清单，不依赖移动分支。每个请求最多两次尝试，单次（含响应体）最多 4 秒，整次查询共享 15 秒总时限；只重试网络异常、超时及临时 HTTP 错误。清单 API 发生可重试故障时才回退到同仓库同标签的官方 raw 地址；401/403/404、限流、无效 JSON/清单或 TLS 证书错误不靠换源绕过。遵守 Retry-After，等待要求超出短重试上限时直接停止。`latest.lookup` 或失败时 `release_lookup` 记录阶段、主机、尝试次数、耗时和错误码，不记录响应内容、登录信息或任务输入。检查失败不使用磁盘旧清单冒充线上最新版本，也不触发软件变更或采集授权。

备份保存在用户目录 `.qdmp-skill/backups/<时间-随机ID>/`。用户级独立安装的 Skill 更新前先保存完整备份、事务日志及目录外独立恢复入口；更新不移动整个 Skill 目录，逐文件原子替换，新增文件优先、`SKILL.md` 最后替换，保留发现入口。普通异常会回滚；进程中断后的下一次 ensure 在联网前检查事务，只在原进程已结束、备份有效且没有并发本地编辑时恢复。不能确定锁所有者、PID 仍有效或文件被额外修改时转人工，不强行覆盖。

如当前脚本无法加载，可运行用户目录中更新前保存的独立入口（将 `<用户目录>` 替换为真实路径）：

```text
node <用户目录>/.qdmp-skill/maintenance/recover-update.mjs
```

恢复不执行新版本下载或采集激活。保留备份及恢复记录；旧文件和中间文件移至备份，不靠递归删除活动 Skill 来恢复。原生插件更新一旦开始，返回不明或校验失败时保存 `update-attempts.json` 并停止同一版本自动重放，先查询真实宿主版本/路径/内容。不要清空整个插件缓存、改宿主信任、编辑采集 consent 或删除历史 flow。

#### 旧客户端的一次性入口

1.1.12 及更旧客户端没有新脚本，不可能仅因为发布了新版就开始自检。必须先通过原市场更新，或由支持人员取得**已发布稳定标签**的完整官方仓库并运行其中入口。不要执行 main 分支下载的未知脚本，也不要使用 curl 管道执行。示例中 `<已发布v标签>` 需换成 GitHub Release 中真实存在的 QDMP 标签，不能用 Telemetry 标签；1.1.13 未正式发布前不能让用户运行此示例：

```text
git clone --depth 1 --branch <已发布v标签> https://github.com/EchoTechFE/qdmp-skill.git <全新临时目录>
node <全新临时目录>/skills/qdmp-skill/scripts/ensure-current.mjs diagnose --host codex --cwd <真实工作目录> --skill-dir <实际旧Skill目录>
node <全新临时目录>/skills/qdmp-skill/scripts/ensure-current.mjs ensure --host codex --cwd <真实工作目录> --skill-dir <实际旧Skill目录>
```

上述命令在 macOS、Windows 终端都适用；含空格的路径必须加引号。CLI 路径、多套 CODEX_HOME/CLAUDE_CONFIG_DIR 按实际会话指定。旧版本升级后必须重新加载，新的自动更新机制才开始生效。

#### 旧引导恢复验收

更新后用新 Skill 的 `monitor-flow.mjs list/status`：`compatibility.current=false` 的 flow 不返回可执行动作；不能修改旧 state 的 manifest_digest、复制新 onboarding 覆盖旧文件或沿旧授权执行新版本。若该目录已有效采集，先读实际运行时状态，继续已有授权，不因 Skill 更新再次激活。若只是同一清单的 `check_failed`，在原 flow 重试 inspect，保留已有同意，不重复询问。若固定版本/法律文案/权限确实发生变化，只对新的必要动作重新告知确认。

引导文件先写临时文件并校验，再提交为正式入口。如果下载已提交而 flow 状态写入中断，下次 fetch 会验证已有文件的 SHA-256 并恢复 `entry_verified`，不重复下载或询问授权；哈希不符则停止，不覆盖现场。

验收需分别记录：当前宿主、实际加载目录、QDMP 版本、监控固定版本/哈希、旧 flow 处理结果、是否需要重新加载。软件维护通过不代表真实 Hook 或生产落库通过。

## 已有工程

- 更新工具不自动重建项目、修改 AppID 或平台类型。
- package.json.version、SDK 版本和通用依赖不是小程序代际判据。
- EMP 工程丢失 loader：核对模板、实际构建链和平台后恢复字段，不把 SPA 硬改为 EMP。
- 本地或平台不是 EMP：停止操作，仅允许关联 EMP 应用并使用 2.0 工程。
- SPA/effuse/echo-effuse/effues 工程不受支持，不提供旧版开发、构建或上传路径。保留原工程，在独立的官方 2.0 模板中迁移业务并验证后再继续。
- 本地开发、开发版本上传和体验版验证统一使用正式开放平台同一个 appId，无需额外配置应用 ID。
- 在前端目录执行 getMe 核对应用；2.0 必须完成 qdmp build 的 EMP 编译。分别记录安装、构建和真机验证结果。
