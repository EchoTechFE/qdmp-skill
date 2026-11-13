# EMP 事件与真机验收

## 前端业务触发与决策

从 `qdmp-skill` 修改、审查或排查前端业务时自动读取本页。用户只说「搜索没反应」「调整列表」「提交失败」也触发。Agent 先从页面或组件追到业务 handler，确认源码是普通 H5 DOM、Taro Vue 的 H5 目标、EMP 目标，还是项目自己的双端封装。按项目锁定的 Taro、Vue、千岛插件和目标 App / SDK 核对实际支持，优先读取当前组件的 props、事件类型、`emits`、已验证的用法和平台文档。

- 只要本次业务涉及交互、表单取值、滚动、导航或宿主能力，就检查受影响的源码绑定、载荷及业务行为。目标端契约一致且原路径工作正常时复用。纯视觉修改或已定位为后端问题时，无需额外改动事件。
- 发现 DOM 依赖、组件契约冲突、产物缺少处理函数或真机分发异常时，由 Agent 决定局部适配。用户要求只读时只定位并说明改法。旧工程已有兼容路径或真实 H5 入口时，保留其端内行为，在边界归一成同一个业务值或动作。
- 对无明文契约的行为，先核对项目锁定版本的类型或源码，再用实际 EMP 产物和最小真机用例确认。只有证据支持才修改，禁止按事件名批量搜索替换整个项目。此规则是 Skill 路由，由 Agent 执行。

## 从小程序源码开始

- HTML 设计稿和已有 H5 预览用于核对布局、样式和视觉状态。小程序业务交互直接写进 Taro Vue 页面，使用目标支持的组件、事件和导航。默认执行项目的 EMP 构建，使用 `qdmp-cli debug` 或已有体验版在千岛 App 中验收；无需为了验证小程序临时加 H5 dev server、浏览器代理或 DOM 实现。
- 将 HTML `onclick`、`addEventListener`、表单默认提交、链接跳转等预览行为拆成 Vue 监听、响应式状态和小程序 API。Taro Vue 模板使用 `@事件`。原生模板中的 `bindtap` 是编译后视图的绑定，不能作为 Taro Vue 源码写法。
- 新增 EMP Taro Vue 的普通点按默认用 `@tap`。已在目标 EMP 验证过的 `@click` 保留；排查时只对受影响入口做最小对照。既支持真实 H5 又支持 EMP 的项目，沿用已有平台适配，分别测试；同一按钮只绑定一个点击事件，避免重复提交。 [千岛前端页面示例](https://open.qiandao.com/docs/guide.md#前端页面开发) · [Taro Vue 事件规范](https://docs.taro.zone/docs/vue-overall#事件)

## H5 到 EMP 的转换规则

先保留用户意图，再转换事件来源、数据载荷和默认行为。H5 使用浏览器的 DOM 事件和默认动作。EMP Vue 使用目标 Taro/千岛组件的事件，编译后的视图绑定和 Bridge 属于运行层。千岛官方示例使用 `@tap`。Taro Vue 的小程序组件事件通常把原生 `bind` 前缀换成 `@` 并使用组件约定的小写事件名。该规则适用于**已确认的组件事件**，自有组件看其 `emits`，不能把所有 H5 事件照此替换。 [千岛开发指南](https://open.qiandao.com/docs/guide.md#前端页面开发) · [Taro Vue 事件](https://docs.taro.zone/docs/vue-overall#事件) · [Vue DOM 事件](https://vuejs.org/guide/essentials/event-handling.html)

| H5 来源 | EMP 表达与数据 | 保留的业务语义 |
| --- | --- | --- |
| `onclick` / Vue DOM `@click` | 普通 EMP 组件用 `@tap="handler"`；第三方组件或自有组件按已声明的事件，可能仍是 `@click`。 | 一次动作只进一个 handler，保留禁用、防重和传入的业务 ID。不要假定输出一定带某个固定分发器名称。 |
| DOM `input` + `event.target.value` | Taro Input 用 `@input` 读取 `event.detail.value`；自有输入组件也可能直接发送字符串或走 `update:modelValue`。 | 区分实时输入和提交确认。双端分别取值后，把字符串交给同一个业务处理函数。 [Taro Input](https://docs.taro.zone/docs/components/forms/input/) |
| `@keyup.enter` 或 HTML 表单隐式提交 | 单个搜索框优先使用确认支持的 Input `@confirm`，再保留可点按搜索入口。原生表单路径用 `<form @submit="...">`、`<button form-type="submit">` 和字段 `name`，读取 `event.detail.value`；宿主不支持时显式收集响应式字段并由按钮提交。 | 聚合校验和防重，别把同一个提交同时绑到表单和按钮 `@tap`。别依赖浏览器 Enter 触发默认按钮或 `preventDefault` 阻止页面跳转。 [HTML 表单隐式提交](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission) · [Taro Form](https://docs.taro.zone/en/docs/components/forms/form) |
| HTML select / checkbox 的 DOM `change` | 用项目已验证的 Picker / CheckboxGroup，对照各自 `@change` 的 `detail.value`。Picker 的值随模式变化，选择模式需将索引映射回业务选项。 | 业务层继续接收原有枚举、ID 或 ID 数组，不能误存显示值、索引或整份事件。 [Taro Picker](https://docs.taro.zone/en/docs/components/forms/picker) |
| `window`、DOM 容器的 scroll 或 IntersectionObserver | 局部滚动先选确实承载滚动的 `scroll-view`，使用其 `@scroll` 或 `@scrolltolower`；整页滚动读项目已支持的页面触底生命周期。 | 每个列表只有一个加载触发源。宿主缺少可靠触底时保留「加载更多」。 [Taro ScrollView](https://docs.taro.zone/docs/components/viewContainer/scroll-view) |
| `<a href>`、路由器或 `window.location` | 小程序内用已验证的导航组件或项目的 `Taro` / `qd` 导航封装，目标需在小程序路由中注册。外链按宿主 WebView 契约处理。 | 保留参数、返回行为及 tab 语义，编码 query 并核对目标页解析。 [千岛 Bridge](https://open.qiandao.com/docs/bridge.md) |
| DOM 冒泡、`.prevent`、鼠标或键盘特有事件 | `.stop` 或事件的 `stopPropagation` 仅在目标组件支持并验证后使用。按语义替换浏览器专有事件，例如悬停操作提供可点按入口。宿主授权事件使用其原生组件及回调。 | 分别检查冒泡、默认动作、遮罩和滚动。组件自定义事件由组件显式发出，不能依赖 DOM 事件委托。 |

例如，双端搜索框在 H5 从 DOM 读取 `target.value`，在 EMP Input 从 `detail.value` 取值，分别在 UI 边界调用同一个接收字符串的函数。已有 Taro H5 实现可能通过组件暴露小程序形状的事件。先核对其真实契约，不能把 H5 目标一概当作原生 DOM。

## 按组件验收

| 功能 | EMP Taro Vue 对应做法 | 验收重点 |
| --- | --- | --- |
| 普通点按、链接 | 普通动作可用 `<view @tap="handleAction">` 或现有组件库按钮的已确认事件。设计稿链接使用已注册的小程序路由和项目的导航封装。 | 点击文本、图标、空白区域均能正确进入一次。禁用或处理中在 handler 守卫。 |
| 组件包一层 | 父级订阅组件声明的事件。自有组件接收内部点按后显式 `emit` 约定的业务事件，核对监听名和载荷，避免父级与组件根节点重复处理。 | 核对父级实际收到数据，列表项用稳定 key 和正确业务 ID。 |
| 嵌套点击 | 例如卡片打开详情，卡片内收藏按钮只执行收藏。优先避免交叠可点击区，必要时用子级 `.stop` 或框架支持的阻止冒泡机制，并在目标宿主验证。 | 子级点击不触发父级；遮罩点击、内容点击、滚动穿透分别验收。事件不冒泡不能证明滚动被阻止。 |
| 输入和搜索 | 使用目标组件支持的 `@input`、`@confirm`。按组件契约读取 `event.detail.value`，优先传业务值，不依赖 `event.target.value` 或浏览器键盘事件。显式搜索与键盘确认复用同一 handler 及请求防重。 | 输入更新及时；键盘确认和按钮都能使用最新输入；快速点按不会重复请求。 [Taro Input](https://docs.taro.zone/docs/components/forms/input/) |
| 列表滚动与加载 | 容器滚动使用实际 scroll-view 的 `@scrolltolower` 等事件；页面滚动使用项目已有的页面生命周期。区分两种滚动源，按加载中和是否还有下一页防重。 | 在实际滚动容器中触发，重复触底不并发加载同一页。 [Taro ScrollView](https://docs.taro.zone/docs/components/viewContainer/scroll-view/) |
| 宿主原生能力 | 保留能力所需的原生组件及准确属性和事件。例如手机号授权用原生 `button open-type="getPhoneNumber"` 与 `@getphonenumber`。 | 通过宿主授权成功、取消、拒绝路径验证实际能力，遵守一次性 code 和脱敏约束。 [手机号授权指南](./phone-authorization.md) |

## 定位分发故障

1. **确认设备实际运行本次构建。** 千岛 App 扫码后核对页面挂载日志和页面显示的构建标识，同时记录操作系统、千岛 App 版本及 SDK 版本。CLI `ready`、收到下载请求或设备连接都是阶段性证据。收不到挂载日志时先处理包可达性、实际版本和调试连接。 [真机调试](./development-guide.md#真机调试)
2. **分别查看编译产物的视图和逻辑层。** 在实际 EMP 输出的页面视图查看事件绑定，在对应逻辑产物定位该节点 handler（例如 `onTap` 或 `onClick`）。通用 `bindtap` 分发器同时出现在两版产物里很常见，单独出现时不说明某个 Vue 处理函数能被调用。构建产物用于取证，修复写回源码。
3. **记录进入 handler 的证据。** 观察一个可见状态或脱敏日志，再查 Bridge 调用及终态、HTTP 结果与业务状态。记录结果类别和数量即可，避免记录授权码、Token、手机号和实际输入内容。
4. **一次只变更一层。** 如果点按未进 handler，只调整受影响入口的事件做最小对照。事件已进入但业务无结果时，再核对 Bridge 终态。保留已经验证的其他宿主和旧入口，不从该案例推断所有事件或所有版本都需要批量替换。既有业务复测原路由、提交防重、登录和会话兼容。

验收记录区分「H5 视觉预览」「EMP 构建」「目标真机交互」。不能用静态产物、H5 点击或 mock 成功代替目标宿主的事件、Bridge 和业务状态。真机不可用时交付已完成的 EMP 检查和可复测步骤，标明真机待验证。
