# 千岛小程序 Taro 设计与页面工作流

本文件覆盖页面设计、设计系统生成、HTML 移植到 Taro、前端页面增量开发和审查。

## 流程一：页面设计

### Step 1：收集设计上下文

询问用户是否有设计参考：

```yaml
questions:
  - question: "有没有现成的设计参考？有就给我，没有我直接按你的产品来设计。"
    header: "设计参考"
    multiSelect: true
    options:
      - label: "参考产品 / App"
        description: "说出产品名，我借鉴它的风格"
      - label: "参考图 / 截图 / 设计稿"
        description: "把图发我，我按照图的视觉风格设计"
      - label: "都没有，直接设计"
        description: "我按你的产品场景自己定方向，做出来给你看"
```

- 参考产品：追问产品名，或使用用户在 Other 中提供的说明。
- 参考图：保存到 `{projectRoot}/design/refs/` 并记录路径。
- 无参考：直接进入设计。

### Step 2：设计页面

页面先用 HTML/CSS 表达；定稿后再移植成 Taro。

优先使用当前可用的 HTML 视觉设计 skill（例如 frontend-design、web-design-engineer、其他能产出可移植 HTML 的设计 skill）。只产出 Figma/mockup、不能落 HTML 的不算。

- 找到 1 个：直接调用该 skill 设计。
- 找到多个：询问用户选择。
- 找不到：如实告知精美设计依赖这类 skill；用户坚持继续时，仍可做可移植 HTML，但视觉质量可能普通。

设计输入：

- 读取 `doc/prd.md`；没有 PRD 时按用户描述的核心功能。
- 使用 Step 1 收集的参考产品、参考图或品牌色。
- 若已有 `DESIGN.md`，必须让新页面延续既有设计系统。

HTML 落地约束：

- 用纯 HTML/CSS 和必要的原生 JS，不用 React 或其他框架。
- 屏幕为宽 375 的根容器；`body` 居中并给中性衬底色。
- 不画手机壳、刘海、状态栏；移植时只取根容器。
- 关键交互路径用 `<a href="<屏名>.html">` 互链，能点通主流程。
- 图标用内联 SVG，图表用手写 SVG；不用 emoji 占图标。
- 每页写入 `{projectRoot}/design/<屏名>.html`。

组件清单：

- 把可复用元素定义为共享 CSS 类，写入 `{projectRoot}/design/assets/` 并由页面 `<link>` 引用。
- 在设计声明中登记每个类的名称和用途。
- 同类元素一律复用同一清单类；遇到清单未覆盖的新元素，先加进清单再复用。

产出：

- 设计声明：设计方向、color/type/layout/signature、关键取舍、组件清单。
- 共享 CSS。
- 各页 HTML 文件。

### Step 3：预览、确认、循环

1. 让用户以移动端视口预览 `design/` 页面。
2. 展示设计声明。
3. 询问确认：

```yaml
questions:
  - question: "当前设计方向和页面符合预期吗？"
    header: "设计确认"
    multiSelect: false
    options:
      - label: "符合，继续"
        description: "确认当前方向，继续完成设计"
      - label: "需要调整"
        description: "告诉我哪些页面要改"
      - label: "不喜欢，重新设计"
        description: "换个方向重做"
```

- 符合且还有页面未设计：继续设计剩余页面，然后回到本步重新确认。
- 全部页面已完成：必须再次询问“全部页面是否符合预期”，用户明确确认后才能生成设计系统。
- 需要调整：按反馈修改后重新预览确认。
- 不喜欢：收集新方向或参考，重做核心页后重新确认。

## 流程二：设计系统生成

不得凭空生成设计系统。只能使用：

1. 用户确认过的设计声明 + `design/*.html`。
2. 现有 `frontend/src/pages/*` + `app.css`（反向提取，只记录现状，不为了对齐去改页面）。

执行 [design-spec.md](design-spec.md)：

1. 生成 `{projectRoot}/DESIGN.md`。
2. 从 HTML 设计页生成时，同步 `app.css :root` token + 公共组件类；从现有项目反向提取时，token 已在代码里则跳过同步。
3. 进入移植前必须展示摘要并询问确认：

```text
设计系统已生成（DESIGN.md）

  设计方向：<一句话理念>
  主色 / 强调色：<主色 hex> + <强调/语义色板>
  字号体系：<display / 标题 / 正文 / 标签 各级字号与用途>
  关键组件：<按钮 / 卡片 / 输入 / 导航 等已定义项>
```

```yaml
questions:
  - question: "设计系统已生成，确认后将据此移植所有页面。是否符合预期？"
    header: "设计系统"
    multiSelect: false
    options:
      - label: "符合，开始移植"
        description: "进入 HTML 到 Taro 移植"
      - label: "需要调整"
        description: "告诉我哪里要改，我更新 DESIGN.md 与代码 token"
```

## 流程三：HTML 移植到 Taro

把 `design/` 下全部 HTML 页面还原为 Taro Vue 页面。执行 [port-guide.md](port-guide.md)，同时遵守 [taro-code-spec.md](taro-code-spec.md)。

1. 按 HTML 屏幕逐页生成 `src/pages/<name>/index.vue` 和 `index.config.js`。
2. 在 `app.config.js` 注册路由。
3. 复用 `app.css` token 和公共组件类；缺少的可复用元素先补到 `app.css` 和 `DESIGN.md`。
4. 起 dev server 渲染，确认无编译或控制台错误。
5. 环境支持截图时，用 375x812 移动视口和 HTML 原稿并排比对，改到观感看不出差别。
6. 执行审查流程，合并重复样式，移除未使用组件类。
7. 列出已移植页面。

## 流程四：前端页面增量开发

### 前置

- 有 `DESIGN.md`：参照 `DESIGN.md` + 现有页面。
- 无 `DESIGN.md` 但有现有页面：照现有页面和 `app.css` 保持一致，不引入新系统。
- 无设计基础且是新页面/成块 UI：先走页面设计和设计系统生成。

### 开发方式

先判断构图类型：

- 和现有页面类似：照参照页写 Taro，结构、token 用法、组件类保持一致。
- 构图全新且没得照：走一次小型“设计 HTML → 预览确认 → 移植 Taro”循环。

所有页面都遵守：

- 写法守 [taro-code-spec.md](taro-code-spec.md)。
- 会复用的新元素沉淀为 `app.css` 公共类并同步 `DESIGN.md`。
- 只出现一次的局部几何可写页面 `<style>`。
- 不直接在 Taro 里凭空排陌生构图。

## 流程五：审查

本次页面全部写完后，启动审查 subagent。传入：

- `DESIGN.md` 全文（如有）
- [taro-code-spec.md](taro-code-spec.md)
- 本次写的所有 Vue 页面
- `app.css`

审查指令：

```text
你是一位资深设计评审师。对照设计系统与设计标准，严格审查页面实现的视觉质量。

对每个页面与 app.css：
1. 核对 taro-code-spec：除组件一次性几何外，无写死 #hex / font-size:数字px（含渐变/阴影颜色），无元素选择器，底部栏用 position:fixed，新增值落成具名 token，图标复用同概念内联 SVG，不用 emoji 当图标。
2. 检查跨页一致性：同类按钮、卡片、输入框、标题、辅助文字的 class 结构与 token 用法一致。
3. 若当前有可用 HTML 设计 skill，用它审独特性与反通用默认。

输出问题，精确到文件名和行号，并给出修改建议。
```

主 agent 根据审查结果修复。未通过则修复后重审，直到通过。
