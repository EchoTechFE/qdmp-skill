# 千岛小程序 · Taro 代码规范

> 本文件是 **Taro 代码该长什么样**的规范——凡写 Taro CSS / 标签都守，不管代码怎么来的：移植（流程五）、增量写页面（流程六）、生成 app.css 的 token 与组件类（流程四）。从 HTML 翻译过来的额外动作见 `port-guide.md`；HTML 设计页的约束见流程三 Step 2。
>

### 取用设计系统

**前提：项目有 token 层时才守本节**（`app.css :root` 有 token，多半也有 `DESIGN.md`）。**没有 token 层**（外来项目 / 全硬编码）→ 本节不适用：照现有页面的写法和值保持一致，别引用不存在的 `var()`、别单方面塞一套 token；要系统化先走流程四反向提取。

token 和公共组件类都在 `app.css`（`:root` 变量 + `.card` / `.btn-primary` / `.input` 等类）。写样式时按用途取值，不写死数字 / 色值：

- **按用途挑现成 token**（这是卡片标题→`var(--text-title)`、分隔线→`var(--outline)`），别从"看着像几 px / 什么色"出发；没有完全对的就用**最接近的那档**，别为 1–2px 或细微色差另写值。
- 是某 token 的深浅 / 透明变体 → 从它派生；确需的新档次 → 在 `app.css` 新建**具名** token / 类再用，并同步进 `DESIGN.md`。**不写死 hex / px——颜色、字号、圆角、阴影、以及渐变内的色都走 `var()`；不每页重写。**
- **例外**：组件自身的一次性几何（固定 `width` / `height`、留白）可直接写，不必 token 化。
- **图标复用**：项目已有同概念图标 → 原样复用同一段内联 SVG，不重画近似的；需新图标按现有风格画；不用 emoji 当图标。

### 布局与样式

- 布局用 Flexbox（Taro 对 Grid 支持有限）。
- 可点击元素加 `.tap-active` class（已在 app.css 定义）。
- 按钮用 `<view>` + `@click` 模拟，不用 `<Button>`（编译多层会破坏布局）。
- **`taro-view-core` 默认 `display:block`**：一行多列布局必须显式 `display:flex`；右侧值用 `margin-left:auto` 或固定宽度列，否则列对不齐。
- **数字 / 货币不换行**：容器加 `white-space:nowrap`，必要时 `flex-shrink:0`，否则会被挤到换行。
- **固定底部 CTA**：`position:fixed` 的按钮，滚动容器留 `padding-bottom`（≥ CTA 高度 + 安全区），否则盖住内容。
- **小容器内文字居中**：badge / pill 内文字仅靠 padding 不居中，显式 `display:flex; align-items:center`（按需加 `justify-content:center`）。
- **禁用 `scrollIntoView`**：iframe / 预览环境会搅乱外层滚动；用 `element.scrollTop` 或 `scrollTo`。
- **用具名 class，别用元素选择器**：`<text>`→`taro-text-core`、`<view>`→`taro-view-core`，`.x span` / `.x svg` / `p` 这类元素选择器不匹配、样式不生效；每个要样式的元素都挂具名 class（`.tab__t` / `.tab__ic`）。

### 动效

- CSS transition 覆盖绝大多数场景（按钮反馈、fade-in 入场、进度条、颜色 / 尺寸变化）。
- Vue `<transition>` 组件处理元素的进入 / 离开动画（v-if / v-show 切换）。
- `:class` 绑定通过 Vue 响应式驱动 CSS class 切换来触发动画。

动效的风格和时长跟随设计方向（见 `DESIGN.md` 的设计理念章节）。

### 两种模板差异

| | default（App 内） | h5（浏览器） |
|---|---|---|
| 顶部导航 | 原生导航栏 | 需自建 |
| 安全区域 | 状态栏 + 底部 | 刘海 + 底部横条 |
| 设计影响 | 不画顶部标题栏 | 可能需自建 |
