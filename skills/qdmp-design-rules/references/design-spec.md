# DESIGN.md 规范与生成方法

流程四按本文件生成 `DESIGN.md`。

遵循 [Google Labs DESIGN.md 规范](https://github.com/google-labs-code/design.md)。

---

## 执行方式

从下列输入生成 `DESIGN.md`，写入 `{projectRoot}/DESIGN.md`。两种输入来源：

1. 流程三的**设计声明** + `design/*.html`（全部 HTML 设计页面）
2. 现有 `frontend/src/pages/*` + `app.css`（及 `tailwind.config.js`）——**反向提取**，只记录现状，**不为对齐去改动现有页面**；token 已在代码里，跳过下文「同步到代码」。

以设计声明为理念骨架，从 HTML/CSS 读取精确 token 填充；声明里的主色 / 强调色等决策必须保持一致，**不得重新发明**。来源 2 没有设计声明时，从现有页面的 CSS 中提取它们实际遵循的设计系统。

---

## 生成方法

### 输入

按上文两种来源之一（设计声明 + HTML 设计页面，或现有页面 + app.css）。

### 生成步骤

0. **以声明为基准**：设计方向、主色、强调色直接采用流程三声明中的决策，**不重新发明**；下面各步只负责填充声明未给出的精确值。

1. **扫描 HTML 里的 CSS**（`:root` 变量和样式规则），把设计**实际用到的每个值**收集起来，再**聚类成一份紧凑且完整的清单**——这份清单要让后续写页面时无需再写死任何值：
   - 颜色 → 收集所有用到的色值，**近的并为一档**（细微差异是噪声），各档给语义名（主色 / 正文 / 分隔线 / 强度色…）
   - 字号 → 收集所有用到的字号，**近的并档**（如相差 ≤2px 归一），各档给角色名（标题 / 正文 / 标签…），并记每档用在什么元素
   - 间距（padding/margin/gap）→ 收集所有节奏值，并到 8 网格档
   - 圆角 / 阴影 → 收集所有层级，各档给名
   - 布局（flex/grid）→ 提取布局模式
   > 原则：**近则并档、缺则成档、不丢档**。设计用到的每个用途都要有对应档；不为 1–2px 的噪声新增冗余档。这是为了让 token 清单"够用且唯一"，避免后续写页面时因为"没有这一档"而写死值。

2. **归纳设计模式**：
   - 按钮用了什么字号、颜色、圆角、内边距？
   - 卡片用了什么背景、圆角、内边距？
   - 输入框用了什么样式？
   - 页面标题、区块标题、正文、辅助文字分别是什么字号？
   - 深色/浅色主题？强调色怎么用的？

3. **对齐设计理念**（以声明的设计方向为基准）：
   - 从 页面的整体气质中，总结产品人格和视觉温度
   - 从色彩使用中，总结配色策略和情感传递
   - 从布局和间距中，总结留白哲学和信息密度

---

## DESIGN.md 格式

### YAML Frontmatter

值使用**屏幕物理 px**（不是 750 设计稿值）：

```yaml
---
name: [项目名]
colors:
  primary: "[从页面提取的主色]"
  on-primary: "[主色上的文字色]"
  primary-container: "[主色浅变体]"
  surface: "[页面背景色]"
  surface-container: "[卡片背景色]"
  on-surface: "[主文字色]"
  on-surface-variant: "[次要文字色]"
  outline: "[边框色]"
  error: "#..."
  # 根据页面实际使用的颜色增减
typography:
  display:
    fontSize: [从页面提取]
    fontWeight: "..."
    lineHeight: [从页面提取]
  headline-lg:
    fontSize: [从页面提取]
    fontWeight: "..."
    lineHeight: [从页面提取]
  body-md:
    fontSize: [从页面提取]
    fontWeight: "..."
    lineHeight: [从页面提取]
  label-md:
    fontSize: [从页面提取]
    fontWeight: "..."
    lineHeight: [从页面提取]
  label-sm:
    fontSize: [从页面提取]
    fontWeight: "..."
    lineHeight: [从页面提取]
rounded:
  # 从页面实际使用的圆角提取
  sm: [如 4px]
  DEFAULT: [如 8px]
  lg: [如 12px]
  xl: [如 16px]
  full: 9999px
spacing:
  unit: [如 8px]
  card-padding: [从页面提取]
  section-gap: [从页面提取]
  page-margin: [从页面提取]
shadow:                                  
  card: "[如 0 6px 22px rgba(0,0,0,.07)]"
  # 按页面实际层级增减（如 ink / hero 重阴影）
motion:                                  
  dur-fast: [如 120ms]                   # 点击反馈
  dur-base: [如 200ms]                   # 常规过渡 / 入场
  ease-std: [如 ease 或 cubic-bezier(.2,.8,.2,1)]
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.surface-container}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card-padding}"
  input:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.DEFAULT}"
  # 根据页面实际使用的组件增减
---
```

### Markdown Body

按以下章节编写（从 页面的实际设计中提炼理念）：

1. **Brand & Style** — 从页面的整体气质中总结产品人格、视觉温度、参考锚点
2. **Colors** — 色板策略、各色语义角色、为什么选这些颜色
3. **Typography** — 字号策略、层级关系、元素→字号映射规则
4. **Layout & Spacing** — 间距哲学、留白策略、布局模式
5. **Elevation & Depth** — 卡片与背景的区分方式
6. **Shapes** — 圆角策略及理由
7. **Components** — 关键组件的样式指导（从页面中提取的实际模式）
8. **Motion & Transitions** — 动效时长 / 缓动的风格与用途（点击反馈、入场、状态过渡），与设计方向一致
9. **Do's and Don'ts** — 本项目的具体禁忌

---

## 同步到代码

DESIGN.md 生成后，把设计系统写进 `app.css`——它是设计系统的唯一代码来源，只放两样：

**1. `:root` token（CSS 变量）** —— 对照 DESIGN.md frontmatter，**它有几类就逐类落变量，一类都不能少**（尺寸值除颜色外一律按**物理 px ×2 → 750 体系**写，如 `16px`→`32px`；pxtransform 会自动转 rem 并响应式，不用自己算）：

| frontmatter 类 | 落成变量 | 换算 |
|---|---|---|
| `colors`     | `--brand` / `--ink` / `--surface`… | hex，不换算 |
| `typography` | `--text-xl` / `--text-lg` / `--text-md`…（字号） | ×2/750 |
| `spacing`    | `--space-*`（unit / card-padding / section-gap / page-margin…） | ×2/750 |
| `rounded`    | `--r-sm` / `--r-md` / `--r-lg`… | ×2/750 |
| `shadow`     | `--shadow-card` / `--shadow-ink`… | ×2/750 |
| `motion`     | `--ease-*` / `--dur-*` + `.tap-active` class | — |

> 一行一类、对齐 frontmatter key：DESIGN.md 里出现的每个类都必须在 app.css 有对应变量；漏一类 = 少一行，写完回扫一遍逐行对齐。

**2. 公共组件类** —— 把设计阶段冻结的组件清单（`design/assets/`）**整套**翻译成 `app.css` 具名类（基础 + 业务：`.card` / `.btn` / `.zonebar` / `.timeinput` …），用 token 拼出供各页挂 class。

- 来源以 `design/assets/` 为准（DESIGN.md `components` 只列关键几个，不全）。
- 写法遵守 [taro-code-spec.md](./taro-code-spec.md)（只挑 token、具名类不用元素选择器）。

`tailwind.config.js` 只做薄引用（`colors: { brand: 'var(--brand)' }`、`spacing: { x: 'var(--space-x)' }`），指向同一组变量防漂移；token 不直接写在 tailwind 里。
