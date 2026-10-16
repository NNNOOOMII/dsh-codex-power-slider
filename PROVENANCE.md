# 素材来源与许可范围（PROVENANCE）

本仓库**全部为代码与文档**，不含任何美术素材（无图片、动图、音效）。图标全部是
内联 SVG path，星点粒子由代码按确定性伪随机生成，因此没有需要单独声明许可的资源。

## 一、许可范围

| 范围 | 许可 |
|---|---|
| `lib/`、`cordis.patch.yml`、`package.json`、`README.md`、本文件 | **MIT**（见 [`LICENSE`](LICENSE)） |
| DSH 主题 token、`--dsw-*` / `--dsh-*` 变量名 | 引用 DeepSeek Harness 的公开设计系统，不复制其代码 |
| 档位文案（轻度 / 标准 / 深度 / 极高 / 深入及其说明） | 复刻 OpenAI Codex 应用的中文界面文案，仅作兼容性兜底；实际显示以 DSH 适配器返回的 `name` / `description` 为准 |

## 二、设计参照

视觉与交互参照 OpenAI Codex 桌面应用的「电源滑块（power slider）」：composer 上方
的浮层卡片 —— 顶部档位名、中部模型名（可下钻模型列表）、底部圆点刻度滑杆，最高档
使用蓝紫渐变与星点粒子。

- 取色与几何（卡片底色 `#2d2d2d`、轨道 `#3f3f3f`、圆点 `#636363`、拖柄 `#ffffff`、
  重置图标 `#808181`、轨道高 36px、拖柄 42px、卡片圆角 20px 等）来自对参照截图的
  逐像素采样。
- 档位文案来自 Codex 应用状态文件中的 `thinking_efforts`（`short_label` /
  `description`），逐条对应到 DSH 适配器公布的推理强度 id。
- **不包含**任何 OpenAI 的代码、字体或图像资源。

## 三、与 DSH 的关系

本插件是 DeepSeek Harness 的第三方插件，不含或修改 DSH 本体代码。它通过公开的客户端
插件约定工作：`window.__ModuleLoader__.load({ id, factory })` 注册一个模块，
`apply(ctx)` 用 `ctx.slots` 往 `conversation.input.left` 挂载一个 React 组件，并通过
`ctx.sessions` / `ctx.remote.session` 读写当前会话的真实模型与推理强度。

## 四、权利主张 / Takedown

如果你认为本仓库的命名、文案或视觉复刻侵犯了你的权利，请开一条 issue 说明**具体内容**
与**依据**，核实后会立即调整或移除，不附加其它条件。
