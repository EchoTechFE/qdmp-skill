# HTML → Taro 移植手册

流程五（移植）把已确认的 HTML 设计页面还原成 Taro Vue 页面时，读取本文件。
本文件介绍**HTML→Taro 的翻译动作**（标签映射、SVG 搬运、单位换算、互链、去框、验真）。
产物同时需符合 **Taro 代码规范**（token 纪律、具名类、渲染坑、定位）见 [taro-code-spec.md](./taro-code-spec.md)。

**核心心态**：保真还原，不是重新设计。以 HTML 原稿为视觉参照，Taro 渲染要和它**看不出差别**，不简化、不降级、不改风格。两点注意：

- **不是逐像素相等**：值取自设计系统 token（流程四已把原稿值聚类、换算），与原稿差 1–2px 正常；标准是"观感看不出差别"。
- **保真针对渲染观感、不是 CSS 源码**：视觉等价的元素**复用设计系统组件类**（见 taro-code-spec），结构归并不算"简化"。

---

## 输入与产物

- **输入**：`design/*.html`（全部）+ 本手册 + `DESIGN.md`。
- **产物**：每个 HTML 屏 → `src/pages/<名>/index.vue` + `index.config.js`，并在 `app.config.js` 注册路由。

---

## 1. SVG：内联保留，几何尺寸别翻倍

**Taro H5 能直接渲染内联 `<svg>`**（环形图的 `<circle stroke-dasharray>`、`<path>` 图标都正常，已实测）。图表、图标把 HTML 里的内联 SVG 原样搬过来，别替换成单字圆圈 / emoji 占位符。

- ⚠️ **几何 / 尺寸保持原值，别按 ×2/750 翻倍**：SVG 的 `width` / `height` / `viewBox` / `d` / `stroke-dasharray` 是属性、**不走 pxtransform**，翻倍会实打实渲染成 2 倍大（实测：图标 `width="18"` 被错翻成 `36`、整个大一圈）。原样照搬即可。
- **`<text>` 进 `<svg>` 要用 `v-html`**：SVG 里的 `<text>`（轴标签、数值）会被 Taro 编译成 `taro-text-core` 而不渲染、标签消失 → 用 `v-html` 把这段当字符串注入：`<g v-html="...">`。动态 path 图标同理：
  ```html
  <svg viewBox="0 0 20 20" fill="none" width="21" height="21" v-html="item.iconPath"></svg>
  ```
- **颜色走 token**：`stroke` / `fill` 用 `var(--*)`，不写死 hex。

---

## 2. 样式：拼装为主，缺则补（写法纪律见 taro-code-spec）

token 和共享组件流程四已建在 `app.css`，移植**主要是拼装 + 局部**：

- **拼装**：给元素挂 `app.css` 已有的组件类（`.card` / `.zonebar`…），不重复定义。
- **局部**：只把**本页独有、不复用**的排版写进本页 `<style>`（如某页的两列布局）。
- **缺了就补**：要用的 token / 共享组件 app.css 里没有 → 按 [taro-code-spec.md](./taro-code-spec.md) 补进 `app.css`（最接近档 → 派生 → 新建具名并同步 `DESIGN.md`），**不写死值、不各页 inline**。

写法（只挑 token、具名 class）遵守 **[taro-code-spec.md](./taro-code-spec.md)**，此处不重复。本节只讲移植特有的 **单位换算**：

- token 值在 app.css 按**物理 px ×2（750 体系）**定义，`<style>` 里直接 `var()` 即可，pxtransform 会转换并响应式，不用自己算。
- 需就地写尺寸时（仅限组件一次性几何）按 750 体系写 px（走 pxtransform）；**绝不用大写 `PX`**（锁死像素、关响应式）。
- 单位行为区分：`<style>` 的 CSS px 走 pxtransform（按 750 写）；**SVG 几何属性不走 pxtransform，按 §1 原样保留**。

---

## 3. 交互与跳转

- 事件统一 **`@click`**，**不用 `@tap`**——`@tap` 在 Taro H5 是合成事件，嵌套 / 滚动结构里会丢点击、handler 不触发；`@click` 是原生 DOM 事件，稳。
- 设计页的屏间互链 `<a href="<屏名>.html">` → `<view @click>` + `Taro.navigateTo({ url: 'pages/<名>/index' })`。
- 列表用 `v-for`；HTML 里 JS 动态生成的 DOM，移植成 `v-for` + 响应式数据。纯展示页用静态占位数据，不调 effuse / 后端。

---

## 4. 其他
- **去掉手机外框**：HTML 原稿可能自带 `.phone` / `.notch` / `.statusbar` 外壳（取决于所用设计 skill）——移植时删掉，只保留屏幕内容。Taro 渲染本身就是手机，外框会变成"手机套手机"。
- **底部栏转 `fixed`**：原稿里贴手机框底部的栏（tabbar / 固定 CTA）是 `position:absolute`；去掉外框后失去定位上下文，**改成 `position:fixed`**，并给滚动区留底部留白（≥ 栏高）。否则底栏会跟着内容滚动。

---

## 5. 验真（移植不是写完就算）

每个页面移植后：

1. 注册路由（`app.config.js`）→ `pnpm run dev` → 渲染，确认无编译 / 控制台报错，且样式全走 token / 组件类（无硬编码 hex/px、复用组件类而非复制样式）。
2. **环境支持截图时**：mobile 视口（375×812）截图（有入场动画先等 ≥500ms 落定），和 HTML 原稿并排逐项比对，有出入对照本手册修，**改到与原稿看不出差别为止**。
3. **环境不支持截图时**：逐项核对前面各节是否落实（SVG 内联 / 尺寸、`var()` token、`@click`、框架差异），并提示用户截图无法自动比对、建议人工核对视觉。

底线：移植后的 Taro 页面，视觉上应和 HTML 原稿**看不出差别**。看出差别 = 移植没完成。
