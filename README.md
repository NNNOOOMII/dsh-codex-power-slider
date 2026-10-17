# dsh-codex-power-slider

给 **DeepSeek Harness（DSH）Web GUI** 装一条 Codex 风格的推理强度滑杆：不用再钻进二级菜单逐档点选，当前在哪一档、还能怎么调，一眼就能看见。

*A third-party, Codex-inspired reasoning effort slider for the DSH Web GUI.*

| 卡片 | Ultra 档 | 模型列表 |
| :---: | :---: | :---: |
| ![推理强度卡片](docs/preview-light.png) | ![Ultra 的紫色扫描与极光](docs/preview-ultra.png) | ![按提供方分组的模型列表](docs/preview-models.png) |

**License MIT · 平台 `dsh web` · 零构建 · 零 Node 依赖**

## 安装

```sh
dsh plugin --profile desktop add dsh-codex-power-slider
```

本地开发也可以把包名换成 `link:C:\path\to\dsh-codex-power-slider`。
这是第三方客户端插件，复刻的是 Codex 桌面应用的交互与材质，**与官方无关**，也不提供模型服务。

## 能做什么

- **把菜单里的档位摊开看。** 浮层卡片用带刻度的滑杆展示推理强度，拖动选择、松手写入当前会话，下一次请求就生效。
- **平时不多占一块地方。** 收起时仍是原生样式的「模型名 + 当前档位 + 下拉箭头」，例如 `6.1 Sol 深入 ⌄`；点开才展开卡片。
- **选强度，也能顺手换模型。** 点卡片里的模型名打开分组列表；当前项打勾，悬停出中文介绍，选完即写入。
- **按模型自适应。** 每个模型支持几档、叫什么、默认哪档，全部读适配器元数据；不足两档时直接不显示滑杆，不会造出不存在的档位。
- **最高档有明确反馈。** Ultra 带紫色扫描、星尘、拖柄墨点与持续流动的极光；停在最高档时提示「使用额度消耗更快」。
- **把子智能体偏好说一次。** 闪电开关会在**下一条**发出的消息末尾追加「优先考虑用子智能体」的偏好说明，不会每条重复；关掉时再补一句「恢复默认」。

## 使用

| 操作 | 结果 |
| --- | --- |
| 点输入框旁的模型入口 | 打开强度卡片；入口变成「选择推理强度」胶囊 |
| 点卡片里的模型名 | 打开独立模型列表，悬停条目看中文介绍 |
| 拖动滑杆 / 点轨道 | 切换推理强度并写入会话（松手提交） |
| 点右上角重置图标 | 回到该模型公布的默认档位 |
| 点左上角闪电开关 | 开启后在下一条消息末尾追加一次子智能体偏好 |
| `↑` `↓` `←` `→` | 焦点在滑杆上时逐档切换 |
| `Esc` | 模型列表 → 卡片 → 关闭 |

闪电开关开启后**常亮**、状态持久化。它追加的是偏好说明，不代表宿主一定会调用子智能体，也不会绕过宿主的路由限制。

## 技术细节

<details>
<summary>接管原生入口 / 卡片参数 / 模型列表（点开）</summary>

### 接管原生入口，而不是再加一个按钮

- 注册在 `conversation.input.model` 插槽、`priority: -1`，遮蔽原生 `ModelSelect`（single 槽「越低越优先」）。
- **收起态**保持原生样式：单行 28–30px、`padding: 0 4px 0 8px`、13px、caption 灰字、12px 下拉箭头。
- **展开后**入口变成 Codex 风格的「选择推理强度」胶囊，卡片浮在上方；两态行高一致，切换时 composer 不重排。

### 卡片与列表

| 部分 | 参数与行为 |
| --- | --- |
| 强度卡片 | 宽 **262px**、圆角 **16px** |
| 档位标题 | 居中 **14px**，下方是可点击的模型名 |
| 滑杆 | 轨道 **22px**、白色拖柄 **25px**、每个档位一个刻度 |
| 模型列表 | 独立圆角浮层，按提供方分组，当前项打勾，34px 行高 |
| 介绍气泡 | 贴在该行右侧，垂直跟随行、水平间距固定 **5px**，宽度贴合文案（≤300px） |
| 额度提醒 | 最高档显示「使用额度消耗更快」，**1.6s** 后淡回模型名 |

</details>

<details>
<summary>Ultra 动效：扫描 / 星尘 / 墨点 / 极光（点开，含全部参数）</summary>

Ultra 皮肤只在**最高档且该模型具备 ≥3 档强度**时启用。

- **1.8s 两段式紫色扫描**：起手用 12% 的时间（约 0.22s）把紫色快速推出来一小截（约轨道右侧 32%），
  剩下 88% 的时间慢慢铺满。用**逐关键帧的 `animation-timing-function`** 实现分段缓动，
  所以起手是「平稳地快」而不是硬弹。
- **材质是 2 倍宽的渐变**，靠 `background-position` 把取景窗从右往左推；两半在基础蓝 `#447ac6` 处
  颜色接续，所以扫描前沿是一道柔和过渡而不是一刀切。只动 `background-position`，
  比位移裁切（`mask` / `clip-path`）在任何 Chromium 上都更稳。
- **一道亮色高光随扫描飘过**：紫侧中段那道 `#9298ff` 跟着扫描从右往左掠过整条轨道。
- **24 颗星尘跟扫描一起揭示**：「紫到哪儿、粒子到哪儿」，不是一开始就铺满。
- **星尘会飘，而且不会撞**：每颗挂在固定锚点上做**两层正交运动** —— 外层沿固定主方向往返
  （漂移 1.6–3.4px / 周期 3.4–5.7s），内层在垂直方向做一次轻脉冲（颤动 0.7–1.3px / 周期 1.3–2.4s）。
  运动包络最多吃掉「到最近邻边缘间隙」里属于自己的份额（份额和恒为 0.9 < 1），
  所以**任意动画相位**下实体边缘都还剩 ≥0.8px；实测全相位最小间隙 **1.36px**、276 对全部达标。
  间隙按**半径比例**分配，大粒子份额更大，所以远景 1.6–3.2px、中景 2.8–3.6px、近景 3.3–3.6px 呈梯度。
- **拖柄溅出墨点**：滑到最高档那一下，柄缘溅出 **8 颗深蓝紫墨点**（`#20204f`–`#252851`，
  比卡片底更暗更蓝，不是发光白点）。一次性 —— 70ms 起步、单颗飞行 400ms、边飞边淡，约 500ms 后完全消失，不循环。
- **持续流动的极光**：最低档之外，Ultra 期间有 **4 层不同颜色（白 / 蓝 / 紫 / 深蓝）、不同周期与相位**
  的宽软光域在持续漂移，任何时刻都在重组；单帧里圈不出其中任何一条的边界。
- **尊重系统设置**：`prefers-reduced-motion: reduce` 时全部动效停掉，扫描停在终态、底光常亮。

</details>

<details>
<summary>档位文案对照（点开）</summary>

适配器返回的 `effort.name` 永远优先；只有适配器只给 id、没有本地化名字时才回落到下表：

| effort id | 显示 | 说明 |
|---|---|---|
| `none` / `min` / `minimal` | 轻度 | 提供快速且深思熟虑的回复 |
| `low` / `light` | 标准 | 平衡思考时间与回复速度 |
| `standard` / `medium` | 深度 | 延长思考时间以处理复杂问题 |
| `high` / `extended` / `xhigh` | 极高 | 适用于复杂问题的极高推理深度 |
| `max` | 深入 | 针对高难度问题提供更深入的分析 |
| `ultra` | Ultra | 同上，并启用 Ultra 皮肤 |

</details>

<details>
<summary>工作原理与第三方插件约束（点开）</summary>

```
conversation.input.model  ← 原生模型选择器所在的 single 槽（session 作用域）
      │  ctx.slots.inject + ctx.slots.register({ priority: -1 })
      ▼
<PowerSlider>  ──portal──▶  document.body（卡片 + 模型列表 + 说明气泡）

读：ctx.sessions.binding(sessionId).session.projections.faceOf('modelSelection')
      → { lastUsed, next }        ← 与原生模型菜单共用同一份投影
列：ctx.remote.session.modelCatalog()
      → groups[].models[].reasoning.{ efforts[{id,name,description}], defaultEffort }
写：ctx.remote.session.selectModel({ sessionId, provider, model, reasoningEffort })
```

关键约束（第三方 client 插件通用）：

- 浏览器半边必须是**经典脚本**：顶层同步 `window.__ModuleLoader__.load({ id, factory })`，
  不能出现 `import` / `export`；`id` 必须等于包名。
- `factory(require)` 只能 require 平台种子：`react`、`react-dom`、`react/jsx-runtime`、
  `@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
  `@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。
- `package.json` 必须有 `dsh.client.platform === "web"` 与 `exports["./client"]`，
  且 `name` 要与 `cordis.patch.yml` 里 `insert.name` 完全一致 —— 不一致会被**静默跳过**。
- 子 slot 必须等声明：`ctx.slots.inject(name, cb)`，直接 `register` 会抛 `slot "…" is not declared`。
- portal 到 `document.body` 的浮层**拿不到**祖先的 CSS 自定义属性；祖先只要有 `transform`
  就会成为 `position: fixed` 的包含块。

> 开发过程中踩过的坑（含我自己的判断错误、可复用的验证手段）单独整理在
> [PITFALLS.md](PITFALLS.md) —— 写 DSH 插件的话值得先读一遍。

</details>

## 已知限制

- **仅支持 web platform**，不是其他客户端平台的插件。
- 在 **subagent 路由会话**里宿主禁止修改模型与推理强度：插件会禁用滑杆并给出中文提示，无法绕过。
- 目录里没有模型、或模型没有任何 reasoning 元数据时滑杆不显示。
- 会话被其它 DSH 写句柄占用时提交会失败，卡片内显示错误文案（`session/writer-held`）。
- **移动端未验证**；**仅在 Chromium 内核测过**，其他内核的显示与交互未验证。

## 开发与预览

`lib/client.js` 是手写的单文件经典脚本，改完直接刷新页面即可生效 —— 宿主按
`mtimeMs/ctimeMs/size` 算 revision，变化会通过 SSE 推 `rebuilt` 帧。

视觉验证用仓库之外的一个离线 harness（本包内不含）：把 `lib/client.js` 挂到**假 DSH 宿主**上渲染成
静态 HTML，再用 Edge 无头模式截图，因此在没有 GUI 的机器上也能核对像素级几何。

## 致谢与来源

- 审美方向与多数动效参数由 **gpt-6.1-sol** 提供意见（差距诊断、参数表、克制边界）。
- 材质颜色按 **Codex 原版截图**逐像素采样；本项目是**第三方复刻**，与 OpenAI / Codex 无隶属关系。

## 许可

MIT，见 [`LICENSE`](LICENSE)。素材与来源说明见 [`PROVENANCE.md`](PROVENANCE.md)；旧版 README 存档于
[`docs/README-v1.md`](docs/README-v1.md)。
