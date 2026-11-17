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
| `@keyup.enter` 或 HTML 表单隐式提交 | 搜索保留可见的点按入口，目标宿主已验收的 Input `@confirm` 可调用同一搜索函数。原生表单路径用 `<form @submit="...">`、`<button form-type="submit">` 和字段 `name`，读取 `event.detail.value`。原生提交不可用时，由已验收的按钮提交响应式字段。 | 两条入口共用校验和防重。表单按钮通过 `form-type` 提交时，同一按钮不再通过 `@tap` 独立提交。核对处理函数收到的业务值。 [Taro Form](https://docs.taro.zone/en/docs/components/forms/form) |
| HTML select / checkbox 的 DOM `change` | 用项目已验证的 Picker / CheckboxGroup，对照各自 `@change` 的 `detail.value`。Picker 的值随模式变化，选择模式需将索引映射回业务选项。 | 业务层继续接收原有枚举、ID 或 ID 数组，不能误存显示值、索引或整份事件。 [Taro Picker](https://docs.taro.zone/en/docs/components/forms/picker) |
| `window`、DOM 容器的 scroll 或 IntersectionObserver | 局部滚动用实际承载滚动的 `scroll-view` 和已验收的触底事件。整页滚动优先复用已验收的页面触底生命周期，必要时用[页面作用域的页尾观察](#自动分页的真机验收)。 | 每个列表只启用一个自动加载触发源，手动「加载更多」复用同一分页函数。 [Taro ScrollView](https://docs.taro.zone/docs/components/viewContainer/scroll-view) |
| `<a href>`、路由器或 `window.location` | 小程序内用已验证的导航组件或项目的 `Taro` / `qd` 导航封装，目标需在小程序路由中注册。外链按宿主 WebView 契约处理。 | 保留参数、返回行为及 tab 语义，编码 query 并核对目标页解析。 [千岛 Bridge](https://open.qiandao.com/docs/bridge.md) |
| DOM 冒泡、`.prevent`、鼠标或键盘特有事件 | `.stop` 或事件的 `stopPropagation` 仅在目标组件支持并验证后使用。按语义替换浏览器专有事件，例如悬停操作提供可点按入口。宿主授权事件使用其原生组件及回调。 | 分别检查冒泡、默认动作、遮罩和滚动。组件自定义事件由组件显式发出，不能依赖 DOM 事件委托。 |

例如，双端搜索框在 H5 从 DOM 读取 `target.value`，在 EMP Input 从 `detail.value` 取值，分别在 UI 边界调用同一个接收字符串的函数。已有 Taro H5 实现可能通过组件暴露小程序形状的事件。先核对其真实契约，不能把 H5 目标一概当作原生 DOM。

## 按组件验收

| 功能 | EMP Taro Vue 对应做法 | 验收重点 |
| --- | --- | --- |
| 普通点按、链接 | 普通动作可用 `<view @tap="handleAction">` 或现有组件库按钮的已确认事件。同类节点真机对照中 `@tap` 生效、`@click` 无响应时，只调整受影响的 EMP 入口。设计稿链接使用已注册的小程序路由和项目的导航封装。 | 点击文本、图标、空白区域均能正确进入一次。禁用或处理中在 handler 守卫。 |
| 组件包一层 | 父级订阅组件声明的事件。自有组件接收内部点按后显式 `emit` 约定的业务事件，核对监听名和载荷，避免父级与组件根节点重复处理。 | 核对父级实际收到数据，列表项用稳定 key 和正确业务 ID。 |
| 嵌套点击 | 例如卡片打开详情，卡片内收藏按钮只执行收藏。优先避免交叠可点击区，必要时用子级 `.stop` 或框架支持的阻止冒泡机制，并在目标宿主验证。 | 子级点击不触发父级；遮罩点击、内容点击、滚动穿透分别验收。事件不冒泡不能证明滚动被阻止。 |
| 输入和搜索 | 使用目标组件支持的 `@input`，按组件契约读取 `event.detail.value` 并更新业务状态。保留页面上的搜索入口，宿主支持 `@confirm` 时让两者调用同一搜索函数并防重。 | 核对 Vue 中的值和搜索结果。键盘展开、原生输入框显示字符和 Vue 收到最新值分别观察。 [Taro Input](https://docs.taro.zone/docs/components/forms/input/) |
| 表单与选择器 | 原生提交或选项显示异常时，可用已在该宿主验过点击的组件触发提交或呈现页内选项，复用原业务校验与 ID 映射。 | 核对提交函数收到最新字段且每次操作只提交一次。选择器打开后核对实际选项、选中值和取消行为。 |
| 列表滚动与加载 | 容器滚动使用实际 `scroll-view` 的 `@scrolltolower`，页面滚动使用项目支持的触底生命周期。先保证内容超过视口或容器可见高度，且能滑到末行。局部滚动失效且整页滚动已验收时，可将列表移入页面滚动流，并提供可达的「加载更多」。 | 分别核对能滚动、触底回调进入和下一页追加。复测备用入口能点按、列表确实追加且到末页停止。重复触底时同一页仅保留一个在途请求。 [Taro ScrollView](https://docs.taro.zone/docs/components/viewContainer/scroll-view/) |
| 宿主原生能力 | 保留能力所需的原生组件及准确属性和事件。例如手机号授权用原生 `button open-type="getPhoneNumber"` 与 `@getphonenumber`。 | 通过宿主授权成功、取消、拒绝路径验证实际能力，遵守一次性 code 和脱敏约束。 [手机号授权指南](./phone-authorization.md) |

## 定位分发故障

1. **确认设备实际运行本次构建。** 千岛 App 扫码后，记录操作系统、千岛 App 版本、SDK 版本和页面构建标识。用 `onMounted` 后才更新的可见状态或该页的明确挂载日志确认 Vue 已挂载。只有原生标题或渲染初始化时，先核对包身份、页面入口和挂载。若设备日志只有渲染层消息，用页面计数、回显或实际业务结果核对交互。 [真机扫码排障](./development-guide.md#真机扫码排障)
2. **分别查看编译产物的视图和逻辑层。** 在实际 EMP 输出的页面视图查看事件绑定，在对应逻辑产物定位该节点 handler（例如 `onTap` 或 `onClick`）。通用 `bindtap` 分发器同时出现在两版产物里很常见，单独出现时不说明某个 Vue 处理函数能被调用。构建产物用于取证，修复写回源码。
3. **记录进入 handler 的证据。** 观察一个可见状态或脱敏日志，再查 Bridge 调用及终态、HTTP 结果与业务状态。记录结果类别和数量即可，避免记录授权码、Token、手机号和实际输入内容。
4. **多种交互同时失效时先验证基础能力。** 从工程中已在目标宿主跑通的页面和构建配置出发，用独立点按更新可见计数、输入更新 Vue 状态、普通长页面滑到末行。逐项恢复嵌套容器、修饰符和业务组件。对照 `@tap` 和 `@click` 时用同类型的独立节点，每个节点仅绑定其一。对照时同时改了 Vue 写法、生命周期或构建配置，就只记录哪组可用，归因需再隔离差异。handler 已进入但业务无结果时，再核对 Bridge 终态。复测原路由、提交防重、登录和会话兼容。

验收记录区分「H5 视觉预览」「EMP 构建」「目标真机交互」。不能用静态产物、H5 点击或 mock 成功代替目标宿主的事件、Bridge 和业务状态。真机不可用时交付已完成的 EMP 检查和可复测步骤，标明真机待验证。

## 自动分页的真机验收

1. 准备至少三页测试数据。先核对实际滚动源、内容高度和页面配置。连续两次滑到追加后的新底部，核对回调、页标识、行数及末页停止。分别记录自动追加和手动加载的结果。 [Taro 页面组件](https://docs.taro.zone/docs/vue-page/#onreachbottom)
2. 整页能滚动但触底回调未派发时，可观察页尾的稳定节点。等页面挂载和节点渲染后，在目标宿主探测页面实例的 `createIntersectionObserver`，或使用 `Taro.createIntersectionObserver` 并显式传入当前页面实例。分别验收创建、绑定和可见性回调；函数存在仍需确认返回了可用的观察器。 [Taro IntersectionObserver](https://docs.taro.zone/docs/apis/wxml/createIntersectionObserver) · [千岛节点与画布能力](https://open.qiandao.com/docs/bridge.md#节点与画布)
3. 用 `relativeToViewport()` 观察页尾，仅在节点由不可见变为可见且还有下一页时走分页函数。追加后验证页尾移出视口，再次滑到新页尾时只追加一页。自动和手动共享同一分页函数及在途请求，成功才推进游标，失败可重试当前页。末页或页面卸载时断开观察。观察器未验证或无法使用时，保留可达的「加载更多」。
