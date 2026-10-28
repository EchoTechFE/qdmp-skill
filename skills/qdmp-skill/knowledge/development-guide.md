# 千岛小程序开发指南

> 本指南用于 2.0（EMP）小程序。文中的 SDK 1.0.0 是能力版本，不是 1.0 小程序运行时；不提供 effuse/SPA 配置或开发路径。

## 项目结构

```
myApp/
├── frontend/
|   ├── src/
│   │   ├── pages/           # 页面目录
│   │   ├── components/      # 组件目录
│   │   ├── composables/     # 组合式函数
│   │   ├── utils/           # 工具函数
│   │   ├── assets/          # 静态资源
│   │   └── app.vue          # 应用入口
|   ├── package.json
|   └── qdmp.json            # 小程序配置（appId、loader 等非敏感配置）
├── backend/                 # 后端服务目录（详见 project-workflows.md）
└── qdmp-config.json         # 主配置：appId、appSecret、runtime、mongodb（敏感，需加入 .gitignore）
```

> 后端目录结构和代码模板详见 [project-workflows.md](./project-workflows.md) 的「流程一：创建项目 - Step 4: 初始化后端代码模板」

---

## 小程序全局权限配置

系统级权限属于小程序全局配置，不是运行时 Bridge API。Taro 项目修改 `frontend/src/app.config.js`；构建后会生成 `app.json`。不要直接修改 `dist/app.json`，它会在下次构建时被覆盖。

两个字段职责不同：

| 字段 | 值 | 用途 |
| ---- | -- | ---- |
| `permission` | `scope` 到 `{ desc }` 的对象映射 | 声明权限用途；`desc` 必须说明当前业务为何需要该权限 |
| `requiredPrivateInfos` | 隐私接口名数组 | 声明小程序实际会调用的隐私接口，例如 `getFuzzyLocation` |

```js
export default defineAppConfig({
  pages: ['pages/index/index'],
  window: {
    navigationBarTitleText: '千岛小程序',
  },
  requiredPrivateInfos: ['getFuzzyLocation'],
  permission: {
    'scope.userFuzzyLocation': {
      desc: '用于展示附近的活动',
    },
    'scope.writePhotosAlbum': {
      desc: '用于将生成的海报保存到系统相册',
    },
  },
})
```

实现步骤：

1. 从需求和实际 API 调用反推所需权限，只声明真实使用的项。
2. 在 `permission` 中使用合法的 `scope.*` 键，并写清具体业务用途；不要使用“用于完善体验”等泛化描述。
3. 对需要在全局配置声明的隐私接口，把接口名加入 `requiredPrivateInfos`；这里填写接口名，不填写 `scope.*`。
4. 保留现有配置并去重，不要为了新增一项权限覆盖整个 `permission` 对象或数组。
5. 执行项目构建，检查生成的 `dist/app.json` 是否包含预期字段，并确认源码中没有未声明的隐私接口调用或不再使用的权限声明。

全局声明不等于用户已授权。需要运行时授权时，仍应在用户主动触发相关功能后按 MCP 核实的授权流程调用相应能力；不要在应用启动时集中索取权限。

---

## 屏幕方向配置（SDK 1.0）

屏幕方向是编译期配置，不是 `qd.*` 运行时 Bridge API。SDK 1.0.0 起，Android、iOS、Harmony 支持全局固定横屏、页面固定横屏和页面自动旋转；Web 不在当前能力广场的支持范围内。

### 全局固定横屏

在 `frontend/src/app.config.js` 的 `window` 中设置 `pageOrientation: 'landscape'`，构建后对应 `app.json.window.pageOrientation`：

```js
export default defineAppConfig({
  pages: ['pages/index/index'],
  window: {
    navigationBarTitleText: '千岛小程序',
    pageOrientation: 'landscape',
  },
})
```

该配置会影响整个小程序。只有所有页面都应固定横屏时才写入全局 `window`；单页横屏不要为了测试方便改成全局配置。

### 页面级横屏或自动旋转

在目标页面的 `index.config.js` 中配置：

```js
// pages/game/index.config.js：固定横屏
export default definePageConfig({
  navigationBarTitleText: '横屏页面',
  pageOrientation: 'landscape',
})
```

```js
// pages/viewer/index.config.js：跟随设备方向自动旋转
export default definePageConfig({
  navigationBarTitleText: '自动旋转页面',
  pageOrientation: 'auto',
})
```

实现与验收要求：

1. 先判断作用域：全应用固定横屏使用全局配置；仅个别页面使用页面级配置。
2. 保留配置文件中的导航栏等已有字段，不要覆盖整个配置对象。
3. 需要在旋转后重排内容时，按 MCP 核实的窗口监听与信息查询能力读取最新宽高；不要只读取一次启动时尺寸。
4. 在 Android、iOS、Harmony 真机分别验收进入页面、旋转、返回和导航栏布局；Web 端提供正常可用的自适应布局作为降级。

---

## 截图黑屏（页面隐私模式）

`screenShotForbidden` 是页面级隐私配置，Android、iOS、Harmony、Web 均支持。目标页面启用后，系统截屏产出黑屏图像；返回未启用的页面后，截屏恢复正常。

### Taro 页面配置

在需要保护的页面 `index.config.js` 中添加 `screenShotForbidden: true`，保留原有配置：

```js
// frontend/src/pages/secret/index.config.js
export default definePageConfig({
  navigationBarTitleText: '隐私页面',
  screenShotForbidden: true,
})
```

如果是新增页面，还需在 `frontend/src/app.config.js` 的 `pages` 数组中注册 `pages/secret/index`。已有页面直接修改其页面配置即可。

### app-config.json 配置

直接维护 `app-config.json` 的项目，也可以在 `modules` 中按页面路径配置：

```json
{
  "modules": {
    "pages/secret/index": {
      "screenShotForbidden": true
    }
  }
}
```

将 `pages/secret/index` 替换为实际页面路径，并保留其他模块及已有字段。Taro 项目优先修改源码中的页面配置，不要直接修改会被构建覆盖的产物。

### 使用与验证

该能力由页面配置启用，无需创建同名运行时调用，也无需注册截屏监听；截屏监听仅用于接收事件，不能代替隐私配置。按需要保护的页面逐页配置，不要写入全局 `window` 或权限声明。

构建并运行更新后的小程序，按以下步骤验证：

1. 从普通页面进入隐私页面，使用系统截屏，确认截图为黑屏。
2. 返回未启用该配置的上一页，再次截屏，确认截图正常。
3. 再次进入隐私页面截屏，确认仍为黑屏。

能力广场的演示入口为「屏幕 → screenShotForbidden → 运行」，对应 `pages/privacy-demo/index`。

---

## 服务端 API 调用

先读取 [云服务使用规范](./backend-operations.md#云服务使用规范) 和 [事实查询流程](./api-discovery.md)。从 MCP 确认业务、认证交换与刷新契约后，生成项目自己的适配层；地址、请求头、字段、错误码、分页模式和 ID 类型不在本指南保存副本。

### Token 管理与自动刷新

保留获取 → 保存 → 检查有效期 → 必要时刷新 → 请求的顺序；并发刷新合并为一个任务。刷新失败保留真实错误，已失效时清理状态并引导重新登录；仍有效时是否沿用以契约为准。凭据字段、时间单位与业务失败判断从 MCP 获取，不把所有错误当成登录失效，也不自动重放写操作。前端只请求应用后端，appSecret 和服务端凭据留在后端。

### 请求函数、Composable 与页面

保留请求封装、数据层和页面三层：请求层处理认证与错误，Composable 管理 loading/data/error 和分页，页面根据真实结果展示并在退出时清理。后端代理按确认的契约构造请求，保留上游状态与错误。配置后端地址、超时和用户触发，不轮询不存在或被拒绝的接口。

路由 query 中的中文、空格和特殊字符使用 encodeURIComponent；图片防盗链仍按项目要求配置。接口按需求查询，不保留 SPU/Tag/Island 与旧路由的对应表。用户登录保持宿主凭据、后端交换、业务请求三个阶段；任一必要能力未收录时明确缺口。

### 验收

保留缓存命中、临期刷新、刷新失败、并发请求、首次登录、用户拒绝、空数据、分页结束、加载失败、页面清理和正常回显场景。错误恢复最多在契约允许且安全的场景执行一次；不存在/方法不支持的路由停止轮询，权限、限流及 WAF 按原因排查。

## 调试技巧

### 本地开发

对于后端，可以使用提示词**后端测试环境**更新本地部署的后端服务。

对于前端，执行以下命令：

```bash
pnpm run dev
```

在浏览器中打开开发者工具调试。

### 真机调试

要求 CLI **0.1.32 或更高稳定版**，仅支持 EMP。先运行 `node <实际 Skill 目录>/scripts/check-cli.mjs 0.1.32`；不足时按升级说明更新。确认本地和平台应用均为 EMP、当前账号具有应用开发权限后，在包含 `qdmp.json` 的前端目录执行（也支持根目录下存在 `frontend/qdmp.json` 的项目）：

```bash
qdmp debug
# 已有本次改动的 EMP 编译产物时，可以跳过构建
qdmp debug --no-build
# 多网卡时选择手机可访问的本机 IPv4 地址
qdmp debug --host 192.168.1.20 --port 9000
```

`--host` 必须替换为本机网卡上手机可访问的 IPv4 地址；默认自动选择。`--port` 范围为 0–65535，默认 0 自动分配端口，以 `ready.port` 为准。

默认执行项目构建和 EMP 编译，启动本地 HTTP 包下载与 WebSocket 日志服务。使用千岛 App 扫码后查看设备连接、设备信息和实时日志；Ctrl+C 停止。此流程不上传平台版本，不设置体验版或发布正式版。首期不支持源码变动自动构建/刷新、断点和单步调试；改动后重新运行命令。

手机必须能够访问运行 CLI 的机器及端口，通常连接同一局域网；不要把 `localhost` 当作手机可访问的电脑地址。Agent 若运行在隔离容器或云端，先确认手机可达；不可达时说明需要在开发者本机运行，不能把容器内部二维码称为可用真机入口。业务接口的域名和环境沿用项目配置，不自动部署后端或替换为浏览器代理 `/api`。

Agent 使用 `qdmp debug --json` 读取 NDJSON；需要对话内展示图片时加 `--qr-output <新的绝对PNG路径>`，确保父目录存在且文件不存在。收到 `ready` 后立即展示 `deepLink` 和实际 `qrImagePath`（或宿主支持的 `qrDataUrl`），保持后台进程运行并读取 `device-connected`、`device-info`、`log`、`device-disconnected`、`error`、`stopped` 事件。不要等待长期进程结束才展示二维码；`ready` 只说明服务就绪，不能当作手机已运行成功。JSON 模式不会交互登录；明确缺少登录态时，按 [Agent 对话登录](./agent-login.md) 执行 `qdmp login --agent --env <prod|dev>`，完成后重试原命令。登录和操作必须使用同一环境；默认 `prod` 读取 `qdmp.json.appId`，显式 `--env dev` 读取 `devAppId`。设置体验版也遵循这一环境与登录规则。

常见失败：无应用开发权限时核对登录账号和平台协作者权限；扫码连接失败时检查 Wi-Fi、所选网卡、端口与防火墙；`--no-build` 提示缺少产物时重新运行 `qdmp debug` 完成构建。重启会产生新的构建快照，使用本次返回的二维码重新扫码。

### 设置体验版

要求 CLI **0.1.32 或更高稳定版**，先运行 `node <实际 Skill 目录>/scripts/check-cli.mjs 0.1.32`。根据用户指定的是当前代码还是已上传版本选择以下入口，保持应用和环境一致。

#### 上传当前代码并设为体验版

用户明确要求上传体验版时，在前端目录执行。`qdmp upload` 本身不会构建，必须先完成 `qdmp build`；版本描述按 [发布流程 Step 4.1](./project-workflows.md#step-4-部署前端服务) 从本次改动生成，限 200 字：

```bash
qdmp build
qdmp upload --experience -d "本次更新说明"
# Agent / CI 可将上面的上传命令替换为以下形式（不要再上传一次）
qdmp upload --experience --json -d "本次更新说明"
```

CLI 自动读取上传接口返回的真实版本号并设为体验版，开发者无需手动输入版本号。普通 `qdmp upload` 不会自动设置体验版；设置体验版不等于提审或正式发布。体验链接和二维码打开平台“当前体验版”，再次切换后会打开新版本，体验权限沿用平台规则。默认使用正式平台的同一个 appId；`--env dev` 选择开发环境 API，不表示“体验版”。

#### 将已上传版本设为体验版

用户已明确选择平台上的版本时，无需重新构建或上传，在同一项目目录执行：

```bash
qdmp experience --version <实际版本号> --env prod
# Agent 使用结构化结果时，改用以下形式
qdmp experience --version <实际版本号> --env prod --json --qr-output <新的绝对PNG路径>
```

`--version` 必填，使用上传结果的 `versionCode` 或开放平台确认的正整数版本号，不使用 `package.json.version`，也不猜测“最新版本”。没有明确目标版本时先确认。CLI 只允许将 `DEVELOPMENT` 状态版本设为体验版；目标已经是当前体验版且状态为 `REVIEW` 时会直接返回成功，其余状态会报错。

#### 结果展示与失败处理

收到 JSON `type=result` 且 `experienceUpdated=true` 后，展示 `versionCode`、`experienceUrl` 和二维码。需要图片文件可使用 `--qr-output <新的绝对PNG路径>`，父目录须存在，目标文件不能已存在；`upload` 仅在同时传入 `--experience` 时支持该参数。若有 `warning`，但体验版已设置成功，则说明只是二维码生成/保存失败，直接展示体验链接，不要重新上传。

上传成功但设置失败时，保留 `uploaded=true`、`versionCode`，使用 CLI 返回的 `retryCommand` 重试设置，不重新构建上传。`qdmp experience --version <实际版本号>` 仅用于这类重试或用户明确选择已有版本；优先复制返回的命令，不要求用户猜版本号。Agent 重试时可追加 `--json`，保留返回的版本号和环境。若提示“无法确认体验版设置结果”，先在开放平台核对当前体验版，再决定是否重试；不要把未知结果报告为失败后自动重复上传。

### 常见问题

| 问题              | 排查方向                                   |
| ----------------- | ------------------------------------------ |
| 页面白屏          | 检查控制台 JS 错误、页面路径是否注册       |
| 样式不生效        | 检查 CSS 兼容性、样式文件引入              |
| 接口 403          | 检查图片防盗链 meta 标签                   |

---

## 发布流程

### 发布前检查

- [ ] 功能测试完成
- [ ] 真机调试通过
- [ ] 版本号已更新
- [ ] 代码已提交 Git

### 发布步骤

```bash
# 1. 打包（必须使用 qdmp build，否则 upload 会失败）
qdmp build

# 2. 检查登录态
qdmp getMe
```

如果未登录或登录失效，CLI 会在支持输入的前台终端提供三种方式：扫码登录、手动登录 URL、账号密码登录。扫码或 URL 登录完成后 CLI 会轮询并保存 Token，随后继续原命令。也可以主动执行：

```bash
qdmp login
```

Agent 对话需要登录时，按 [Agent 对话登录](./agent-login.md) 执行 `qdmp login --agent --env <env>`，立即展示返回的链接和 PNG 图片并等待成功。无人值守的 CI 请预先设置 `QDMP_TOKEN`；未设置时 CLI 应输出错误并退出。登录成功后再上传：

```bash
qdmp-cli upload -d "新增商品筛选并优化加载体验"
```

账号密码交互登录需由用户直接操作前台终端，不能与构建、上传串联；密码不回显属于正常现象。Agent 使用独立的 `--agent` 登录进程展示链接和图片，不需要用户操作终端，也不在聊天中索取账号或密码。

通过本 skill 发版时，版本描述会根据本次 Git 改动自动总结并传入，无需手动编写。

上传后前往 [千岛开放平台](https://open.qiandao.com) 提交审核。
