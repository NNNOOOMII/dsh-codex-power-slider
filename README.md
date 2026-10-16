# dsh-codex-power-slider

> 给 **DeepSeek Harness** 的 Web GUI 装上 OpenAI Codex 风格的「思考强度电源滑块」：
> composer 里一颗胶囊，点开就是一张浮层卡片 —— 顶部当前档位、中部模型名（可下钻模型列表）、
> 底部圆点刻度滑杆；最高档是蓝紫渐变 + 星点粒子。
>
> 数据全部是 **DSH 真实会话数据**：档位来自当前模型适配器公布的 reasoning efforts，
> 模型来自会话模型目录，拖动即调用 `remote.session.selectModel`，下一次请求立即生效。

## 效果

| 最低档（轻度） | 最高档：紫色正从右向左扫过来 | 最高档：铺满整条轨道 | 模型列表 |
|---|---|---|---|
| ![轻度](docs/preview-light.png) | ![扫描中](docs/preview-sweep.png) | ![Ultra](docs/preview-ultra.png) | ![模型列表](docs/preview-models.png) |

> 上面四张是用离线 harness 把 `lib/client.js` 挂到假 DSH 宿主上真实渲染、再由 Edge 无头截的图
> （渲染脚本见工作区 `tools/render-preview.mjs`，不在本包内）。第二张是把扫描动画固定在 50%
> 的冻结帧：左边还是基础蓝、右边已经被紫色盖住，粒子跟着一起蔓过来。

```
┌──────────────────────────────────────┐
│                              ↺       │   ← 恢复该模型默认档位
│              轻度                    │   ← 当前档位（最高档是蓝紫渐变 + 星点）
│            6.1 Sol ›                 │   ← 当前模型，点开模型列表
│  ●────────○──────○──────○──────○     │   ← 圆点刻度 + 白色拖柄
└──────────────────────────────────────┘
              [ 轻度 ▾ ]                     ← composer 工具条里的触发器
```

## 最高档（Ultra）的动效

切到最高档不是「换个颜色」，而是一段 2.4s 的动效：

- **紫色从右边缘向左扫过**：一条 2 倍宽的材质（左半基础蓝、右半紫蓝本体），靠
  `background-position` 把取景窗从右往左推。用 `background-position` 而不是位移裁切，
  是因为它的插值在任何 Chromium 上都一定平滑；两半渐变在基础蓝 `#447ac6` 处**颜色接续**，
  所以扫描前沿是一道柔和过渡，不是一刀切。
- **粒子跟着蔓延**：24 颗浮尘长在材质层里，用同一套时长与缓动做 `clip-path` 揭示，
  「紫到哪儿、粒子到哪儿」，不是一开始就铺满。
- **粒子会飘（不是只闪）**：每颗浮尘挂在两层锚点上，**X / Y 各跑一个独立周期**
  （X 10–23s、Y 7.5–18s，均 `ease-in-out` 闭合往返），合成弯曲轨迹 —— 既不是直线往返，
  也不会全体同步；粒子自身只做 5.3–9.1s 的**呼吸**（最低降到峰值的 60–78%），不再闪烁。
- **三层景深**：18 颗远景（0.95–1.8px 小而实）、5 颗中景（2.0–2.9px，小实核 + 软边）、
  1 颗近景（3.4–4.0px，大而虚）。用径向渐变软边代替动态 `blur`，静态绘制、只动
  `transform / opacity`。
- **材质里有光**：两层静态径向柔光，其中一层以 11.7s 缓慢呼吸，负责「材质发光」而不是
  「白点堆叠」。
- **向外溅一下**：切换瞬间从拖柄位置溅出 10 颗偏紫 `#7772d8` 的小粒子，0.95s 后消失。
- **尊重系统设置**：`prefers-reduced-motion: reduce` 时停掉全部动效。

> 这一版的审美方向由 **gpt-6.1-sol** 给出（差距诊断 + 参数表 + 复审收口），
> 落地时保留了我按参考图逐像素采样的材质色，并把「钉住材质」的裁切方案换回
> 滑动渐变，以保住原版那条柔和的前沿。

## 特性

- **真实生效**：拖动滑杆写入会话的 `reasoningEffort`，与 DSH 原生模型菜单共用同一份
  会话选择状态；两边随时保持一致（原生菜单改了，卡片跟着变，反之亦然）。
- **按模型自适应**：每个模型支持几档、叫什么、默认哪一档，全部读适配器元数据。
  模型可选项不足时不显示滑杆，不会造出不存在的档位。
- **零构建**：`lib/client.js` 是手写的单文件经典脚本，宿主直接读取字节下发，
  不需要 tsdown / rollup / pnpm build。
- **零 Node 依赖**：Node 半边是空插件，不注册服务、不开 HTTP 路由、不注入 index，
  因此不会和其它插件抢 `webServer` / index 注入通道。
- **跟随主题**：暗色取色对齐 Codex 原版，亮色走 `body:not([data-ds-dark-theme])` 覆盖，
  同时尽量复用 `--dsw-alias-*` 语义 token。
- **键盘可用**：`↑ ↓ ← →` 调整档位，`Esc` 退出模型列表 / 关闭卡片，
  `role="slider"` + `aria-valuetext` 完整无障碍语义。

## 安装

### 方式一：本地开发（link）

```powershell
# 1. 把包放进 profile（绝对路径）
dsh plugin --profile desktop add link:C:\path\to\dsh-codex-power-slider
```

等价的手工做法（`dsh` CLI 不可用时）：

1. 在本机 profile 目录 `%DSH_HOME%\profiles\desktop` 下：
   - `package.json` 的 `dependencies` 增加
     `"dsh-codex-power-slider": "link:C:\\path\\to\\dsh-codex-power-slider"`；
   - `dsh.profile.bundles` 数组追加 `"dsh-codex-power-slider"`；
2. 在同目录执行 `pnpm install`；
3. 让 DSH 重新加载插件树（重启应用，或在「设置 → 插件」里重新启用一次）。

只想临时挂载、不改 `bundles` 时，也可以直接在本 profile 的补丁层
`cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-codex-power-slider
      name: dsh-codex-power-slider
```

### 方式二：npm

```powershell
dsh plugin --profile desktop add dsh-codex-power-slider
```

### 卸载

```powershell
dsh plugin --profile desktop remove dsh-codex-power-slider
```

## 使用

| 操作 | 效果 |
|---|---|
| 点工具条里的胶囊 | 打开 / 关闭卡片 |
| 点卡片中间的模型名 `›` | 进入模型列表（按提供方分组，当前项打勾） |
| 鼠标悬停模型行 | 右侧浮出该模型的说明气泡 |
| 拖动滑杆 / 点轨道 | 切换推理强度，松手即提交 |
| 点右上角 `↺` | 回到该模型的默认推理强度 |
| `↑` `↓` `←` `→` | 焦点在滑杆上时逐档切换 |
| `Esc` | 模型列表 → 卡片 → 关闭 |

## 工作原理

```
composer 工具条
  conversation.input.left  ← 空闲的 list slot（session 作用域）
        │  ctx.slots.inject + ctx.slots.register
        ▼
  <dsh-codex-power-slider>  ──portal──▶  document.body（浮层卡片 + 说明气泡）

读：ctx.sessions.binding(sessionId).session.projections.faceOf('modelSelection')
      → { lastUsed, next }        ← 与原生模型菜单共用同一份投影
列：ctx.remote.session.modelCatalog()
      → groups[].models[].reasoning.{ efforts[{id,name,description}], defaultEffort }
写：ctx.remote.session.selectModel({ sessionId, provider, model, reasoningEffort })
      → RemoteResult；失败码 session/writer-held 会提示「会话被占用」
```

关键实现约束（第三方 client 插件通用）：

- 浏览器半边必须是**经典脚本**：顶层同步 `window.__ModuleLoader__.load({ id, factory })`，
  不能出现 `import` / `export`；`id` 必须等于包名。
- `factory(require)` 只能 require 平台种子：`react`、`react-dom`、`react/jsx-runtime`、
  `@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
  `@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。
- `package.json` 必须有 `dsh.client.platform === "web"` 与 `exports["./client"]`，
  且 `name` 必须与 `cordis.patch.yml` 里 `insert.name` 完全一致 —— 不一致会被**静默跳过**。
- 子 slot 必须等声明：`ctx.slots.inject(name, cb)`，直接 `register` 会抛
  `slot "…" is not declared`。

## 档位文案对照

DSH 适配器返回的 `effort.name` 永远优先。只有当适配器只给出 id（没有本地化名字）时，
才回落到 Codex 原版中文文案：

| effort id | 显示 | 完整名 | 说明 |
|---|---|---|---|
| `none` / `min` / `minimal` | 轻度 | 快速思考 | 提供快速且深思熟虑的回复 |
| `low` / `light` | 标准 | 思考中 | 平衡思考时间与回复速度 |
| `standard` / `medium` | 深度 | 进阶思考 | 延长思考时间以处理复杂问题 |
| `high` / `extended` / `xhigh` | 极高 | 极高 Thinking | 适用于复杂问题的极高推理深度 |
| `max` | 深入 | 深度思考 | 针对高难度问题提供更深入的分析 |
| `ultra` | Ultra | Ultra | 针对高难度问题提供更深入的分析 |

最高档（且该模型 ≥ 3 档）会切换成蓝紫渐变 + 星点粒子的「Ultra」皮肤。

## 限制

- 只对**普通会话**生效；被寻址的 subagent 会话不公开模型选择（DSH 侧的约束）。
- 目录里没有模型、或模型没有任何 reasoning 元数据时，滑杆不显示，胶囊退化为只读。
- 会话被其它 DSH 写句柄占用时提交会失败，卡片下方显示错误文案（对应
  `session/writer-held`）。
- 卡片宽度固定 320px（拖柄 34px / 轨道高 30px / 标题 17px）；窗口过窄时会自动左右夹紧，不会跑出视口。

## 开发与预览

仓库根目录之外还有一个离线预览 harness（不在本包内），用 Edge 无头模式把
`lib/client.js` 挂到假的 DSH 宿主上截图，用于在没有 GUI 的环境里检查视觉：

```powershell
# 需要同时存在 preview/ 目录（含 React UMD 与 harness.html）
powershell -File preview\shot.ps1 preview\harness.html preview\out\plugin.png
```

改完 `lib/client.js` 直接刷新页面即可生效 —— 宿主按 `mtimeMs/ctimeMs/size` 算 revision，
变化会通过 SSE 推 `rebuilt` 帧；只有替换或移除 `dsh-client-modules` 本身才需要整页刷新。

## 许可

MIT，见 [`LICENSE`](LICENSE)。素材与来源说明见 [`PROVENANCE.md`](PROVENANCE.md)。
