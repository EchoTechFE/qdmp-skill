# 千岛小程序蓝牙 BLE 指南

本指南属于现有 `qdmp-skill` 知识库，覆盖手机作为 BLE 中心设备 / 客户端的设备发现、连接、GATT 读写与通知、MTU、清理重连和 Android 配对。不覆盖蓝牙信标扫描、手机作为外围设备广播或 GATT 服务端。

所有原生蓝牙调用统一使用 `qd.*`；Taro 只负责页面、组件、展示状态与生命周期。不要换用其他宿主命名空间或绕过 Bridge 调用容器内部对象。接入前先阅读项目配置、依赖、页面结构和已有蓝牙状态管理代码，区分通用 GATT 探索与已知设备协议。

按需阅读：[API 目录](#api-目录)、[调用流程](#调用流程)、[Bridge 调用与状态管理](#bridge-调用与状态管理)、[二进制与串行分包](#二进制与串行分包)、[诊断与验证](#诊断与验证)。

## 能力检测与平台

调用前使用 `qd.canIUse(methodName)` 或函数存在性检查；平台和 SDK 版本不能代替真实能力检测。方法存在之外，还要验证适配器状态、连接、特征 `properties` 和参数。

`qd.getDeviceInfo()` 的 `platform` 可能是复合值，逗号前为设备平台，后面为宿主容器。判断 Android / iOS 时取第一段，同时在诊断中保留原值：

```js
const info = await Promise.resolve(qd.getDeviceInfo())
const rawPlatform = String(info.platform || '')
const [devicePlatform = '', hostPlatform = ''] = rawPlatform
  .toLowerCase().split(',').map(value => value.trim())
```

权限声明沿用 [开发指南的全局权限配置](./development-guide.md#小程序全局权限配置)，只声明实际需要且平台支持的项，不凭空补造 scope。运行时权限在用户主动使用相关功能时按需申请。

## API 目录

以下字段是各阶段需要关注的结果，不是完整响应类型。保留宿主真实返回和错误，不为缺失字段补造成功值。

### 准备与扫描

| API | 用途 | 参数、前置条件与结果 |
| --- | --- | --- |
| `qd.openBluetoothAdapter` | 初始化 BLE 模块 | 中心设备使用 `{ mode: 'central' }`；保留 `errMsg` 及实际错误字段 |
| `qd.getBluetoothAdapterState` | 查询蓝牙与扫描状态 | `available`、`discovering` |
| `qd.onBluetoothAdapterStateChange` | 监听蓝牙和扫描状态变化 | `available`、`discovering` |
| `qd.offBluetoothAdapterStateChange` | 移除适配器状态监听 | 按当前 Bridge 支持的注销方式管理范围 |
| `qd.startBluetoothDevicesDiscovery` | 开始搜索 BLE 设备 | 已知主服务 UUID 时传 `services`；设备由发现事件返回 |
| `qd.stopBluetoothDevicesDiscovery` | 停止搜索 | 保留实际调用结果；停止成功后再连接 |
| `qd.onBluetoothDeviceFound` | 接收设备广播 | `devices[]`，按 `deviceId` 合并名称、RSSI、广播数据、服务和可连接性 |
| `qd.offBluetoothDeviceFound` | 移除设备发现监听 | 不等于停止系统搜索 |
| `qd.getBluetoothDevices` | 查询本次适配器会话缓存的设备 | `devices[]`；缓存设备不保证仍在附近 |

### 连接与 GATT 服务

| API | 用途 | 参数、前置条件与结果 |
| --- | --- | --- |
| `qd.getConnectedBluetoothDevices` | 按主服务 UUID 查询系统已连接设备 | 适配器已初始化，传非空 `services` |
| `qd.createBLEConnection` | 连接选中设备 | `{ deviceId, timeout }`；真实 `deviceId` 来自本次扫描或系统连接结果 |
| `qd.closeBLEConnection` | 断开连接 | 当前连接的 `deviceId` |
| `qd.onBLEConnectionStateChange` | 监听连接或断开 | `deviceId`、`connected` |
| `qd.offBLEConnectionStateChange` | 移除连接监听 | 优先传注册时同一回调，具体以当前 Bridge 支持为准 |
| `qd.getBLEDeviceServices` | 查询 GATT 服务 | `{ deviceId }`；返回 `services[]`，关注 `uuid`、`isPrimary` |
| `qd.getBLEDeviceCharacteristics` | 查询服务特征及能力 | `{ deviceId, serviceId }`；返回 `characteristics[]` 及 `properties` |
| `qd.getBLEDeviceRSSI` | 查询连接设备信号 | `RSSI`，单位 dBm，不等于距离 |

### 读写与通知

读写、通知的端点均由 `deviceId`、`serviceId`、`characteristicId` 标识；服务和特征 ID 必须来自当前连接的查询结果。

| API | 用途 | 参数与结果边界 |
| --- | --- | --- |
| `qd.readBLECharacteristicValue` | 请求读取特征 | 要求 `read`；实际字节由特征值事件返回 |
| `qd.writeBLECharacteristicValue` | 写入特征 | `value` 为 `ArrayBuffer`，`writeType` 匹配 `write` / `writeNoResponse`；返回成功不是协议 ACK |
| `qd.notifyBLECharacteristicValueChange` | 开启或关闭通知 | `state: true` / `false`；类型匹配 `notify` / `indicate` 能力 |
| `qd.onBLECharacteristicValueChange` | 接收读取结果和通知 | 按设备、服务、特征路由 `value: ArrayBuffer`，保留原始字节 |
| `qd.offBLECharacteristicValueChange` | 移除特征值监听 | 共用入口集中管理，只清理本模块持有的监听 |

### MTU、清理与 Android 配对

| API | 用途 | 关键判断 |
| --- | --- | --- |
| `qd.getBLEMTU` | 查询当前 MTU | 使用真实返回，不根据申请值推断 |
| `qd.setBLEMTU` | Android 申请协商 MTU | 随后查询或监听实际值；iOS 不调用 |
| `qd.onBLEMTUChange` | 监听 MTU 变化 | `deviceId`、`mtu` |
| `qd.offBLEMTUChange` | 移除 MTU 监听 | 只清理本模块持有的监听 |
| `qd.closeBluetoothAdapter` | 关闭蓝牙模块 | 扫描、连接、服务、特征和 MTU 状态随之失效 |
| `qd.isBluetoothDevicePaired` | 查询系统配对状态 | Android；解释真实响应，调用成功不代表已配对 |
| `qd.makeBluetoothPair` | 对明确需要真实 PIN 的设备发起系统配对 | Android；按接口要求编码已提供的 PIN，不生成、查询、猜测或记录 PIN |
| `qd.openSystemBluetoothSetting` | 打开系统蓝牙设置 | Android；由用户点击直接触发，返回不代表系统状态已改变 |

## 调用流程

### 初始化、搜索与连接

1. 调用 `qd.openBluetoothAdapter({ mode: 'central' })`。
2. 注册一次适配器状态和设备发现监听，再查询 `qd.getBluetoothAdapterState`，展示真实的 `available` / `discovering`。
3. 开始搜索，按 `deviceId` 合并发现事件。仅需实时 RSSI 或广播变化时开启 `allowDuplicatesKey: true`，并节流页面刷新。
4. 用户选择设备后先停止搜索，停止成功后再连接。不要自动连接猜测的设备 ID。
5. 先注册连接状态监听，再调用 `qd.createBLEConnection`。
6. 连接成功后查询服务，从实际结果选择服务，再查询该服务的特征。
7. 根据特征 `properties` 决定可用操作：缺少 `read`、`write` / `writeNoResponse` 或 `notify` / `indicate` 时，不调用对应能力。

搜索启动成功不表示已找到设备；连接成功仅证明 BLE 链路建立，查询 GATT 成功也不表示应用协议已知。

### 读取与通知

- 读取：确认 `read` 能力 → 注册共享的 `qd.onBLECharacteristicValueChange` → 发起读取 → 等待匹配三个端点 ID 的事件，解析其中的 `ArrayBuffer`。为等待设置有限超时。
- 通知：确认 `notify` / `indicate` 能力 → 先注册共享监听 → 对端点设置 `state: true` → 等到真实通知事件后再确认数据链路可用。
- 结束通知：连接仍有效时，对相同端点设置 `state: false`，并更新本模块的订阅状态。

监听是否存在和特征是否已订阅是两个独立状态；移除监听不会自动关闭设备订阅，关闭订阅也不会移除监听。

### 写入与协议回复

1. 确认 `write` / `writeNoResponse`，选择匹配的 `writeType`。
2. 按已知设备协议编码 `ArrayBuffer`。未知协议只展示 GATT 能力，不猜测指令、校验或回复格式。
3. 协议要求回复时，先开启回复特征通知，并在发送前建立待处理回复和有限超时。
4. 按实际可写长度串行分包；任一包失败、取消、断线或超时后停止后续包。
5. 按协议校验完整帧，并匹配命令或会话字段。分片通知先组帧，再匹配回复；无效或未匹配帧可记录，但不能当作成功。
6. 成功、失败、断线、取消或超时都清除待处理回复。

写入调用完成只证明 Bridge 写操作完成；协议确认和设备实物结果单独判断。

### MTU 与包长

调用 `qd.getBLEMTU` 读取当前值。Android 需要协商时，先注册 `qd.onBLEMTUChange`，再调用 `qd.setBLEMTU`，随后查询或监听实际值；iOS 使用宿主返回值，不调用 `setBLEMTU`。

常见 ATT 有效载荷为 `mtu - 3`，Bridge 和外设还可能有更小限制。MTU 未知或证据不足时使用保守包长，不能用申请值填充实际 MTU。只有外设证据要求时才增加包间延迟，延迟不能代替协议 ACK 或流控。

### 断开、重连与页面清理

一个蓝牙管理器集中持有适配器、扫描、设备、连接、服务、特征、订阅、MTU、监听和进行中操作。断开、切换设备、关闭适配器或取消整套流程时，立即废弃旧服务、旧特征、订阅、MTU 和待处理回复；用 `generation` 或取消令牌阻止旧回调修改新会话。

清理应可重复执行：

1. 停止扫描，取消协议等待与分包任务。
2. 连接仍有效时，关闭本模块开启的通知。
3. 移除本模块注册的监听，断开持有的连接，清理本地状态。
4. 仅当本应用确实拥有适配器生命周期时，才调用 `qd.closeBluetoothAdapter`。

单项清理失败仍应继续清理其余资源，并保留原始错误。页面隐藏或卸载时取消进行中的流程并停止扫描；是否保持连接由产品需求决定。

重连必须重新确认目标设备、建立连接、查询服务和特征、开启所需通知，再判断协议能力并发送数据；不要复用旧 GATT / MTU / 订阅状态。完整重置后从适配器初始化重新开始。

### Android 配对与系统设置

只有设备明确要求 PIN 且已获得真实 PIN 时才发起系统配对。PIN 不进入日志，其他密钥应脱敏。配对成功不保证 GATT 或应用协议可用。

系统设置由用户点击直接打开；返回后重新查询蓝牙和配对状态，不直接标记已开启或已配对。Android 搜索可能受蓝牙、附近设备、定位权限和系统位置开关影响，应保留真实错误后提示检查；iOS 拒绝授权后重复搜索不能修复权限，应引导用户检查系统设置。

## Bridge 调用与状态管理

蓝牙请求可用 callback 适配 Promise，并保留原始结果。以下封装仅用于支持 `success` / `fail` 的蓝牙请求；`on*` / `off*` 监听方法不通过此封装。

```js
function requireQdMethod(name) {
  const bridge = globalThis.qd
  if (!bridge) throw new Error('当前环境没有 qd Bridge')
  const supported = typeof bridge.canIUse === 'function'
    ? bridge.canIUse(name)
    : typeof bridge[name] === 'function'
  if (!supported || typeof bridge[name] !== 'function') {
    throw new Error(`当前千岛客户端不支持 qd.${name}`)
  }
  return bridge[name].bind(bridge)
}

function callQd(name, params = {}) {
  const invoke = requireQdMethod(name)
  return new Promise((resolve, reject) => {
    invoke({ ...params, success: resolve, fail: reject })
  })
}

const state = await callQd('getBluetoothAdapterState')
```

保存监听函数引用，按当前 Bridge 支持的方式注销；如果某个 `off*` 只能整体移除监听，应由共享管理器统一处理，避免页面误清理其他功能的监听。

特征值监听只注册一个入口，按设备 / 服务 / 特征分发给读取、协议和诊断消费者。下面是应用内分发示例，`consumers` 不是 SDK 字段：

```js
const consumers = new Map()

function endpointKey(value) {
  return [
    String(value.deviceId || ''),
    String(value.serviceId || '').toUpperCase(),
    String(value.characteristicId || '').toUpperCase(),
  ].join('|')
}

function handleValueChange(event) {
  const handlers = consumers.get(endpointKey(event))
  if (!handlers || !(event.value instanceof ArrayBuffer)) return
  handlers.forEach(handler => handler(event.value, event))
}
```

注册消费者和分发事件时使用同一个端点键规则，另行记录哪些特征已成功订阅。回调还需检查当前会话代数，避免跨设备或重连后的晚到事件污染状态。

## 二进制与串行分包

Bridge 要求 `ArrayBuffer` 时，不传字符串、JSON、Base64 文本或 typed-array view。十六进制工具可用于明确提供的协议字节或诊断展示：

```js
function hexToBuffer(input) {
  const clean = String(input).replace(/\s+/g, '').toLowerCase()
  if (!clean || clean.length % 2 || !/^[0-9a-f]+$/.test(clean)) {
    throw new Error('请输入完整十六进制字节')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes.buffer
}

function bufferToHex(value) {
  return Array.from(new Uint8Array(value), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

// bytes 为 Uint8Array；write 将当前 chunk 传给 qd.writeBLECharacteristicValue。
async function writeChunks(bytes, limit, write, cancelled) {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('无效分包长度')
  for (let offset = 0; offset < bytes.length; offset += limit) {
    if (cancelled()) throw new Error('已取消')
    const chunk = bytes.slice(offset, Math.min(offset + limit, bytes.length))
    await write(chunk.buffer)
  }
}
```

调用方应将断线、取消、超时和会话失效都反映到 `cancelled()`；`write` 必须等待当前包的真实调用结果，失败时抛出原始错误以中止后续包。

## 诊断与验证

诊断保留 API 名、开始 / 结束时间、脱敏参数、真实结果 / 错误、端点 ID 和接收字节。二进制可转为十六进制展示；截断时保留总字节数和“已截断”标记。应用日志的状态字段不是 SDK 响应字段。

| 证据 | 可以证明 | 不能证明 |
| --- | --- | --- |
| 搜索启动成功 | Bridge 接受搜索请求 | 已发现目标设备 |
| 连接成功 | BLE 链路建立 | 已支持应用协议 |
| 服务 / 特征查询成功 | 获取 GATT 元数据 | 设备会执行任意命令 |
| 读取调用成功 | 读取请求已提交 | 已收到实际字节 |
| 通知开启成功 | 订阅配置完成 | 已收到通知事件 |
| 写入调用成功 | Bridge 完成写操作 | 外设已接受并执行指令 |
| 配对调用成功 | 配对操作成功返回 | GATT 或应用协议已可用 |

浏览器、开发者工具和普通 H5 只能验证页面与普通状态，不能证明真实 BLE 行为。千岛 App 真机验证应覆盖正常流程、蓝牙关闭、权限拒绝、空搜索、连接超时、缺少特征能力、通知超时、写入失败、传输中断线、主动取消、切后台清理和重连；实现后再运行项目已有测试和构建。
