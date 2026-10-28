# 千岛小程序普通音频播放指南

本指南属于现有 `qdmp-skill` 知识库，覆盖普通音频实例的创建、播放、暂停、停止和销毁。工厂方法的正确拼写是 `qd.createInnerAudioContext`。后台音频、录音和音频文件选择不属于这五项能力，不随普通播放需求一并接入。

按需阅读：[五项能力](#五项能力)、[实例与音源管理](#实例与音源管理)、[使用调用模板](#使用调用模板)、[返回值与事件](#返回值与事件)、[验证重点](#验证重点)。

## 五项能力

| 能力 | 调用形式 | 用途与前置条件 |
| --- | --- | --- |
| 创建实例 | `qd.createInnerAudioContext()` | 获取普通音频实例；创建本身不设置音源、不主动播放 |
| 播放 / 继续 | `audio.play()` | 已创建实例；首次播放前设置 `src`，暂停后沿用同一实例和音源 |
| 暂停 | `audio.pause()` | 对当前实例调用暂停；继续时再调用 `play()` |
| 停止 | `audio.stop()` | 对当前实例调用停止，不用 `pause()` 替代；停止后重新播放的位置需在目标端验证 |
| 销毁 | `audio.destroy()` | 释放实例；成功调用后清除本地引用，需要再次播放时明确创建新实例 |

五个原生方法均按无参数方式调用，不传入 `success`、`fail` 或其他请求对象。记录真实同步返回；如果运行环境实际返回 Promise，则记录完成或拒绝结果，这是兼容处理，不承诺每个方法都返回 Promise。

使用前检查 `qd.createInnerAudioContext` 和所需实例方法是否存在；事件也逐项检测，不预设三端一致。资源格式、本地路径支持、声音表现和错误结构均以目标运行环境的真实结果为准。

## 实例与音源管理

- 创建与播放分开管理。未创建或已销毁时，控制操作提示先创建，不隐式创建或恢复实例。
- 原生实例保存在普通变量或闭包中，不交给 Vue 深层响应式代理；响应式状态只保存展示数据。
- 调用实例方法必须保留所属实例的 `this`，不要直接解构后调用。
- 暂停后用同一实例的 `play()` 继续，音源未变时不重复设置 `src`，避免重置播放进度。
- 网络音源直接赋给 `src`，无需为了播放自动下载；本地音源使用宿主真实返回的可用路径，不伪造临时路径。

```js
// audio 是已创建的实例；selectedSource 由调用方提供。
audio.autoplay = false
audio.loop = false
if (currentSource !== selectedSource) {
  audio.src = selectedSource
  currentSource = selectedSource
}
audio.play()
```

`src`、`autoplay` 和 `loop` 是实例属性，不是 `play()` 的参数。上述自动播放和循环配置是示例默认值，可按明确需求调整。示例不绑定应用名称、应用 ID、账号、设备或固定业务音源。

## 使用调用模板

可复制 [普通音频调用模板](../assets/inner-audio.mjs) 到项目合适的位置。模板由调用方提供 SDK、音源和记录函数，不依赖 Vue、Taro 或其他项目文件：

```js
import { createAudioControls } from './inner-audio.mjs'

const controls = createAudioControls(qd, record => {
  console.log('[audio]', record)
  // 需要持久化时，另行制作可序列化的展示副本。
})

// 以下操作分别由对应按钮或明确的业务生命周期触发，不在初始化时依次执行。
async function onCreate() {
  await controls.create()
}
async function onPlay(selectedSource) {
  await controls.play(selectedSource)
}
async function onResume() {
  await controls.play() // 沿用上次音源。
}
async function onPause() {
  await controls.pause()
}
async function onStop() {
  await controls.stop()
}
async function onDestroy() {
  await controls.destroy()
}
```

页面调用时用 `try/catch` 将错误转成用户可读提示，完整原始错误仍由记录函数保留。模板的控制方法返回 Promise 是封装设计，不代表底层方法均为异步方法。

模板把实例放在普通闭包中；在已有实例时提示先销毁，并阻止并发控制操作。这两个限制是示例策略，不是原生接口要求。原生是否支持多个实例，应按实际业务需要另行验证。销毁调用失败时保留原始错误及本地引用，不冒充资源已释放。

## 返回值与事件

方法返回、Promise 结果、异常和实际播放事件分别记录。同步返回 `undefined` 或 Promise 完成，都不能直接判定声音已播放成功。

模板日志字段是应用封装字段，不是 SDK 响应字段：

| `phase` | 含义 |
| --- | --- |
| `request` | 开始调用原生方法，`arguments: []` 表示无方法参数 |
| `returned` | 原生方法同步返回，`value` 保留实际值 |
| `resolved` | 原生返回的 Promise 完成，`value` 保留实际值 |
| `threw` / `rejected` | 同步异常 / Promise 拒绝，`error` 保留原始对象 |
| `blocked` | 示例前置检查未通过、属性设置失败或实例无效，不是原生失败回调 |

实例可能包含循环引用、原生对象或方法，不直接将创建结果当作普通 JSON 序列化。`undefined` 与 `null` 不等价，需要 JSON 展示时使用明确标记保存 `undefined`，不要替换成 `null`。记录函数失败也不能改写原生调用结果。

实际播放状态应观察实例提供的事件，例如：

```js
const audio = await controls.create()
const onPlay = payload => console.log('[audio event] onPlay', payload)
const onError = error => console.log('[audio event] onError', error)
if (typeof audio.onPlay === 'function') audio.onPlay(onPlay)
if (typeof audio.onError === 'function') audio.onError(onError)

// 以下放在不再观察或页面销毁时，不在创建后立刻执行。
async function disposeAudio() {
  if (typeof audio.offPlay === 'function') audio.offPlay(onPlay)
  if (typeof audio.offError === 'function') audio.offError(onError)
  await controls.destroy()
}
```

注册和解绑分别放在对应生命周期，只解绑自己注册的回调。需要时同样观察实例提供的 `onPause`、`onStop`、`onEnded`，保留真实事件载荷，不预设字段，也不以方法返回替代事件。

页面隐藏是否暂停由产品需求决定；离开页面后不再使用实例时释放资源。在调用验证页面中保留明确的创建、播放、暂停、停止、销毁操作，使每个方法都能单独验证。

## 验证重点

- 创建不自动播放，未创建时点击控制按钮不会触发创建。
- 播放 → 暂停 → 播放保持同一实例和音源，观察是否从暂停位置继续。
- 停止和暂停分别验证；停止后重新播放的位置记录实际表现。
- 销毁后控制操作提示先创建，再次明确创建后才可播放。
- 调用结果与真实事件分开，失败保留原始错误，界面展示可读提示。
- 运行项目已有检查；真实发声、音源支持和跨端行为在目标千岛 App 环境验证，不把封装测试当作三端一致性结论。
