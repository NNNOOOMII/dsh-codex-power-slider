# DSH 插件市场提交表（已按项目实况填好）

> 生成时间：2026-10-20 · 对应 main `796613f`
> ⚠️ 提交前必读：**npm 上还没有这个包**（`registry.npmjs.org/dsh-codex-power-slider` 返回 404）。
> 表单要求「要显示在插件商城必须有 NPM 包」，所以**建议先 `npm publish`，再用下面的「安装命令」**；
> 如果暂时不发 npm，只能填源码安装形式，商城可能不收录。

---

### 仓库地址

https://github.com/NNNOOOMII/dsh-codex-power-slider

### 一句话价值

在 DSH Web GUI 的输入框里装一条 Codex 风格的推理强度滑杆：拖动即切换当前模型的思考档位、松手即写入会话，Ultra 档带紫色扫描、星尘与持续流动的极光。

### 能力分类

模型与推理

> 备选：界面与体验（如果同类里更看重"它替换了模型入口 UI"这一点）

### 安装命令

```bash
# 发布 npm 之后（推荐，商城收录要求）
dsh plugin --profile desktop add dsh-codex-power-slider

# 仅源码安装（未发 npm 时）
dsh plugin --profile desktop add github:NNNNOOOMII/dsh-codex-power-slider
```

> 表单示例里写的是 `--profile web`；本插件实测在 `desktop` profile（DSH Web GUI）下工作，
> 若你的部署 profile 名不同，把 `desktop` 换成实际 profile 名即可。

### 兼容与运行要求

- **平台**：仅 `web`（DSH Web GUI / desktop profile），不支持 terminal / tui
- **DSH 版本**：未标注具体版本号；依赖 `conversation.input.model` 插槽与 `dsh-client-ui-primitives`，随宿主 API 演进
- **运行环境**：无 Node 运行时依赖、无构建步骤（单文件 classic script，直接由 `__ModuleLoader__` 加载）
- **依赖模型要求**：模型须在 catalog 中提供 ≥2 个推理档位，否则自动隐藏滑杆（不显示空控件）

### 许可证

MIT

### 截图 / 演示

仓库内（GitHub 可直开）：

- Ultra 档材质与极光：`docs/preview-ultra.png`
- 模型列表 + 介绍气泡：`docs/preview-models.png`
- 入口两态（收起 / 展开）：`docs/chip-states.png`
- 入场扫描对照：`docs/preview-sweep-ab.png`

### 补充说明

- **无网络请求**：插件不发起任何外部 HTTP 请求，不收集遥测，不读取凭据
- **无额外权限**：只通过宿主公开的 client 服务（`remote.session` / `conversation` / 插槽 API）读写会话状态
- **它会改什么**：切换当前会话的 `reasoningEffort`；接管原生模型入口以加入档位滑杆（`priority: -1` 遮蔽默认 `ModelSelect`）
- **已知限制**：
  - 由**子代理路由接管**的会话，宿主禁止修改模型/强度 → 滑杆自动禁用并给出中文提示（不静默失败）
  - 仅 Web 平台；移动端未验证
  - 与官方无关，是第三方社区插件

### 提交前自查

- [x] 仓库已公开（`public`，GitHub API 核验）
- [x] 已添加 GitHub topic：`dsh-plugin`（另有 dsh / deepseek-harness / client-plugin / codex / reasoning-effort 等）
- [x] README 包含安装命令
- [x] 插件导出 `apply(ctx)` 模块（`lib/client.js`）
- [x] 仓库根目录包含 `package.json`（`name: dsh-codex-power-slider`，`version: 0.1.0`）
- [ ] **npm 已发布** ← 唯一未完成项，关系到商城是否收录
