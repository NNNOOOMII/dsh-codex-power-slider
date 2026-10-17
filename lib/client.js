/**
 * dsh-codex-power-slider —— 浏览器半边（browser half）
 * ============================================================================
 * 这是一个**手写的经典脚本**，没有任何构建步骤：宿主侧
 * `@deepseek-ai/dsh-client-modules` 只按 `exports["./client"]` 读文件字节，
 * 组合进 combo 后由 shell 以 <script> 执行。因此：
 *   - 不能用 import/export（会语法错误）；
 *   - 顶层必须同步调用 window.__ModuleLoader__.load({ id, factory })；
 *   - factory 里能 require 的只有平台种子：
 *     react / react-dom / react/jsx-runtime / @deepseek-ai/cordis /
 *     @deepseek-ai/dsh-client-store / dsh-client-ui-slots /
 *     dsh-client-ui-primitives / dsh-client-ui-dockkit。
 *
 * 视觉参照 OpenAI Codex 应用的「电源滑块 / power slider」：
 * 一张浮在 composer 上方的卡片 —— 顶部是当前档位名，下面是模型名（可下钻
 * 到模型列表），底部是带圆点刻度的滑杆；最高档使用蓝紫渐变 + 星点粒子。
 *
 * 数据全部来自 DSH 真实会话：读 = modelSelection 投影，列 = modelCatalog，
 * 写 = remote.session.selectModel。没有任何假数据。
 */
window.__ModuleLoader__.load({
  id: 'dsh-codex-power-slider',
  factory: (require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    /**
     * 原生 UI 基座：展开面必须复用宿主自己的 `MenuSurface`，这样菜单材质（半透明底、
     * 圆角、阴影、macOS backing）与原生菜单**完全同源**，不会出现「卡片套在菜单里」。
     * 若宿主版本没有这个导出，退化为一个自带表面样式的 div。
     */
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const MenuSurface = primitives && primitives.MenuSurface ? primitives.MenuSurface : null

    const PLUGIN_ID = 'dsh-codex-power-slider'
    /** 挂载点：原生模型选择器所在的 slot（见下方 SLOT 的说明）。 */
    /**
     * 接管原生模型选择器所在的 slot。
     * `conversation.input.model` 是 single 槽，原生 ModelSelect 用默认 priority 0 注册；
     * slot 语义是「priority 越低越优先」，所以 -1 能遮蔽它 —— 收起态由我复刻成原生一模一样，
     * 展开态换成「模型行 + 思考强度滑杆」的合并面板（gpt-6.1-sol 方案 B）。
     */
    const SLOT = 'conversation.input.model'
    const SLOT_PRIORITY = -1
    const NAMESPACE = 'dsh-codex-power-slider'
    /** 面板几何：282 = 原生菜单 min(240)/max(420) 区间内，与旧卡片同宽。 */
    const PANEL_W = 282
    /** 原生 MenuSurface 自身 padding。 */
    const MENU_PAD = 4
    /** 控制区左右内缩（让模型行、标题、说明、滑杆四者左边缘对齐）。 */
    const CTRL_PAD = 8
    /** 滑杆轨道可用宽度：282 − 8（表面 padding）− 16（控制区）= 258。 */
    const TRACK_W = PANEL_W - MENU_PAD * 2 - CTRL_PAD * 2
    /** 轨道 / 拖柄按 sol 规格瘦身（原 26 / 29）。 */
    const TRACK_H = 22
    const KNOB_D = 24
    const TRACK_INSET = TRACK_H / 2
    const TIP_W = 210
    /** 墨点环按拖柄直径等比缩放（基准是 46px 拖柄的那组测量值）。 */
    const INK_SCALE = KNOB_D / 46

    /* 几何：面板 / 轨道 / 拖柄的尺寸集中在这里，CSS 与拖拽计算共用同一组常量，
       避免两头各写一份数字对不上。 */
    /** 最高档「深入」时滑杆下方稳定显示的额度提醒（原版原文）。 */
    const QUOTA_HINT = '使用额度消耗更快'
    /* 星尘的「不重叠」保证：两颗之间至少要留 GAP，离轨道边界至少 EDGE；
       间隙按**半径比例**分给两颗 —— 大粒子占更大份额，所以它动得更多。
       份额之和恒等于 DUST_SHARE_TOTAL（0.9 < 1），所以保证依然成立：
       env_i + env_j <= 0.9 × slack => 剩余间隙 >= 0.1×(中心距−两半径) + 0.9×GAP >= GAP。 */
    const DUST_GAP = 0.8
    const DUST_EDGE = 0.8
    const DUST_SHARE_TOTAL = 0.9
    /** 第 ratio 档时，拖柄圆心 / 圆点相对轨道的 left 值（两端各留半个轨道高）。 */
    const posAt = (ratio) => 'calc(' + TRACK_INSET + 'px + (100% - ' + TRACK_H + 'px) * ' + ratio + ')'

    /* ======================================================================
     * 一、Codex 原版档位文案（当 DSH 适配器只给出 id、没有中文名时兜底）
     *     —— 取自 Codex 应用 thinking_efforts 的 short_label / description。
     * ==================================================================== */
    const CODEX_TIERS = [
      { short: '轻度', full: '快速思考', desc: '提供快速且深思熟虑的回复' },
      { short: '标准', full: '思考中', desc: '平衡思考时间与回复速度' },
      { short: '深度', full: '进阶思考', desc: '延长思考时间以处理复杂问题' },
      { short: '极高', full: '极高 Thinking', desc: '适用于复杂问题的极高推理深度' },
      { short: '深入', full: '深度思考', desc: '针对高难度问题提供更深入的分析' },
    ]
    const CODEX_TIER_BY_ID = {
      none: 0, min: 0, minimal: 0, minimal_effort: 0,
      low: 1, light: 1,
      standard: 2, medium: 2, normal: 2,
      high: 3, extended: 3,
      xhigh: 3, 'x-high': 3,
      max: 4,
    }

    /* ======================================================================
     * 二、样式（走 DSH 主题 token，暗色下与 Codex 原版取色一致）
     * ==================================================================== */
    const CSS = `
/* 触发器与浮层共用一套 token 作用域：浮层是 portal 到 document.body 的，
   不再是 .dshcps-root 的后代，所以两处都必须声明变量。 */
.dshcps-root,.dshcps-menu,.dshcps-tip{
  --dshcps-card:#2d2d2d; --dshcps-line:rgba(255,255,255,.06);
  --dshcps-accent:#447ac6; --dshcps-accent-dim:#2f5fa8;
  --dshcps-sub:#a8a8a8; --dshcps-sub-hover:#d4d4d4; --dshcps-icon:#808181;
  --dshcps-track:#3f3f3f; --dshcps-dot:#636363; --dshcps-knob:#ffffff;
  --dshcps-panel:#2c2c2c; --dshcps-row-hover:#3a3a3a; --dshcps-row:#d4d4d4;
  --dshcps-dim:#808181; --dshcps-tip:#323232; --dshcps-tip-text:#d4d4d4;
  /* 最高档：展开面里只做一次克制的实色强调（gpt-6.1-sol：收起态不加任何强调） */
  --dshcps-ultra-label:#a6a0ef;
  --dshcps-focus:#9d98e8;
  --dshcps-shadow:0 18px 48px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.35);
}
.dshcps-root{display:inline-flex; align-items:center; font-family:var(--dsw-font-family,system-ui,sans-serif)}
.dshcps-menu,.dshcps-tip{font-family:var(--dsw-font-family,system-ui,sans-serif)}
body:not([data-ds-dark-theme]) .dshcps-root,
body:not([data-ds-dark-theme]) .dshcps-menu,
body:not([data-ds-dark-theme]) .dshcps-tip{
  --dshcps-card:#ffffff; --dshcps-line:rgba(0,0,0,.07);
  --dshcps-sub:#6b6b6b; --dshcps-sub-hover:#111111; --dshcps-icon:#8a8a8a;
  --dshcps-track:#ececec; --dshcps-dot:#c4c4c4;
  --dshcps-panel:#ffffff; --dshcps-row-hover:#f1f1f1; --dshcps-row:#161616;
  --dshcps-dim:#8a8a8a; --dshcps-tip:#f6f6f6; --dshcps-tip-text:#161616;
  --dshcps-ultra-label:#7773ba;
  --dshcps-focus:#8f89e0;
  --dshcps-shadow:0 18px 48px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08);
}

/* ---------- 收起态：完全复刻原生 ModelSelect trigger ----------
   原生值全部照抄（height 28 / padding 0 4px 0 8px / gap 4 / 13px 400 / caption 灰字）。
   gpt-6.1-sol 的规则：最高档不在这里加渐变、紫点、边框、背景 —— 那属于展开面；
   收起态的「深入」两个字本身就是最高档的表达。 */
.dshcps-root{position:relative;min-width:0}
.dshcps-trigger{
  box-sizing:border-box; display:flex; align-items:center; gap:4px;
  height:28px; min-width:0; max-width:min(360px,45cqw); padding:0 4px 0 8px;
  border:0; border-radius:var(--dsw-radius-sm); background:0 0;
  color:var(--dsw-alias-label-secondary); font-family:inherit; font-size:13px;
  font-weight:400; line-height:20px; cursor:pointer;
}
.dshcps-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshcps-trigger:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dshcps-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dshcps-triggerLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshcps-triggerEffort{
  min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:var(--dsw-alias-label-caption); flex-shrink:1000;
}
.dshcps-triggerChev{flex:none;color:var(--dsw-alias-label-caption);transition:transform .12s}
.dshcps-triggerChev.is-open{transform:rotate(180deg)}

/* ---------- 展开面：只保留一层表面材质（原生 MenuSurface） ----------
   这里不写 background / border-radius / box-shadow —— 全部来自 MenuSurface，
   所以和原生菜单是同一块材质，不会出现「卡片套在菜单里」。 */
.dshcps-menu{
  box-sizing:border-box; position:fixed; z-index:1200;
  display:flex; flex-direction:column; padding:${MENU_PAD}px;
  width:${PANEL_W}px; min-width:min(240px,100vw - 32px); max-width:min(420px,100vw - 32px);
  max-height:min(360px,100vh - 96px); overflow:hidden; border:0;
  color:var(--dsw-alias-label-primary);
  animation:dshcps-menu-in .12s ease-out;
}
@keyframes dshcps-menu-in{from{opacity:0}to{opacity:1}}

/* 一级：原生 cell 行（模型 · 当前值 ›），数值 34px 高、左右 8px、13px/20px */
.dshcps-cell{
  box-sizing:border-box; display:flex; align-items:center; gap:6px; flex:none;
  width:auto; min-width:100%; height:34px; padding:0 ${CTRL_PAD}px;
  border:0; border-radius:var(--dsw-radius-md); background:0 0;
  color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px;
  line-height:20px; font-weight:400; text-align:left; cursor:pointer;
}
.dshcps-cell:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshcps-cell:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dshcps-cell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dshcps-cellLabel{flex:none;white-space:nowrap}
.dshcps-cellValue{
  flex:auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  text-align:right; color:var(--dsw-alias-label-tertiary);
}
.dshcps-cellChev{flex:none;width:12px;height:12px;color:var(--dsw-alias-menu-icon)}
.dshcps-divider{flex:none;height:1px;margin:4px ${CTRL_PAD}px;background:var(--dsw-alias-border-l1)}
/* 底部「两行模型入口」：整块是 button、52px 高。
   默认不画边框、不填底色、不加阴影 —— 它是有命中区域的按钮，不是第二张卡片；
   hover 只给原生背景色（gpt-6.1-sol：源码里原生 hover 就是改 background，没有 box-shadow，
   用户说的「阴影」其实是 hover 后出现的圆角底）。 */
.dshcps-entry{
  box-sizing:border-box; display:flex; align-items:center; gap:8px; flex:none;
  width:calc(100% - px); height:52px; margin:0 px px;
  padding:0 10px; border:0; border-radius:var(--dsw-radius-md);
  background:0 0; color:inherit; font-family:inherit; text-align:left; cursor:pointer;
}
.dshcps-entry:hover:not(:disabled),.dshcps-entry:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dshcps-entry:disabled{cursor:default;opacity:.6}
.dshcps-entryText{flex:auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.dshcps-entryTop{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshcps-entryName{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshcps-entryChev{flex:none;width:12px;height:12px;color:var(--dsw-alias-menu-icon)}
/* 模型菜单：入口正下方接出来的独立 MenuSurface（同宽 282、padding 4） */
.dshcps-submenu{
  box-sizing:border-box; position:fixed; z-index:1200;
  display:flex; flex-direction:column; padding:px;
  width:px; min-width:min(240px,100vw - 32px); max-width:min(420px,100vw - 32px);
  max-height:min(360px,100vh - 96px); overflow:hidden; border:0;
  color:var(--dsw-alias-label-primary);
  animation:dshcps-submenu-in .08s ease-out;
}
/* 「从下面弹出来」：只做 80ms 淡入 + 4px 上移归零，不做弹簧 */
@keyframes dshcps-submenu-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

/* 思考强度：标题行（左标签 / 右当前值）+ 紧凑滑杆 + 固定说明位。
   四者左右都对齐到 CTRL_PAD。 */
.dshcps-control{flex:none;min-width:0;padding:6px ${CTRL_PAD}px ${CTRL_PAD}px}
.dshcps-heading{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  min-height:20px; font-size:13px; line-height:20px; font-weight:400;
}
.dshcps-value{flex:none;color:var(--dsw-alias-label-tertiary)}
/* 最高档：只在展开面里用一次克制的实色强调，不做渐变文字 */
.dshcps-value.is-ultra{color:var(--dshcps-ultra-label)}
.dshcps-help{
  min-height:18px; margin-top:6px; font-size:12px; line-height:18px;
  color:var(--dsw-alias-label-caption);
}
.dshcps-help:empty{visibility:hidden}
.dshcps-hint{
  /* 原生 caption 色；额度是决策信息，不再 1.6s 后消失 */
  color:var(--dsw-alias-label-caption);
}

/* ---------- 滑杆 ---------- */
.dshcps-slot{display:flex;align-items:center;height:34px;margin-top:6px}
.dshcps-track{
  position:relative; flex:auto; height:${TRACK_H}px; border-radius:999px;
  background:var(--dsw-alias-interactive-bg-hover,var(--dshcps-track)); cursor:pointer; touch-action:none;
}
.dshcps-track:focus-visible{outline:2px solid var(--dshcps-focus);outline-offset:2px}
.dshcps-track.is-locked{cursor:default;opacity:.55}
.dshcps-fill{
  position:absolute; left:0; top:0; bottom:0; width:0; border-radius:999px; overflow:hidden;
  background:linear-gradient(90deg,var(--dshcps-accent-dim),var(--dshcps-accent));
  transition:width .24s cubic-bezier(.2,0,0,1),background .24s ease;
}
/* 最高档（Ultra）：一条 2 倍宽的材质（左半基础蓝、右半紫蓝本体），用
   background-position 把「取景窗」从右往左推 —— 紫色连同星尘一起从右边缘铺开。
   只动 background-position 的插值一定平滑，而且两半在基础蓝处接续，
   所以扫描前沿是一道柔和的过渡，不是一刀切。
   顶层那圈径向柔光不动，只呼吸，负责「材质里有光」而不是「白点堆叠」。 */
.dshcps-ultra{
  position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none;
  --dshcps-sweep:1.8s;
  /* 底光强度（深色主题）× 呼吸区间，乘出来约 .036–.059，属于「几乎看不出在动」的量级 */
  --dshcps-haze-alpha:.065;
  background-image:
    radial-gradient(ellipse at 54% 28%,
      rgba(211,203,255,.14) 0%, rgba(185,175,255,.05) 38%, rgba(185,175,255,0) 72%),
    linear-gradient(90deg,
      var(--dshcps-accent-dim) 0%, #3a6cb2 25%, var(--dshcps-accent) 50%,
      #737fe5 60%, #8b89ee 68%, #9298ff 74%, #908cf1 79%,
      #7b7be3 88%, #616dd3 100%);
  background-size:100% 100%, 200% 100%;
  background-repeat:no-repeat;
  background-position:0 0, 0% 0%;
  animation:dshcps-ultra-sweep var(--dshcps-sweep) linear both;
}
/* 两段式：起手用 12% 的时间（约 0.22s）把紫色快速推出来一小截（32% 进度，平稳减速不是硬弹），
   剩下 88% 的时间再慢慢铺满 —— 用逐关键帧的 animation-timing-function 分段。 */
@keyframes dshcps-ultra-sweep{
  0%{
    background-position:0 0, 0% 0%;
    animation-timing-function:cubic-bezier(.30,.70,.35,1);
  }
  12%{
    background-position:0 0, 32% 0%;
    animation-timing-function:cubic-bezier(.28,.06,.30,1);
  }
  100%{background-position:0 0, 100% 0%}
}
/* 浅色主题：底光再弱一档，运动与渐变范围不变 */
body:not([data-ds-dark-theme]) .dshcps-ultra{
  --dshcps-haze-alpha:.035;
}
/* 材质底光：铺满之后**不再有会移动的光**（用户明确要求：只保留切档那一次扫入）。
   这层只做极弱的明暗呼吸，峰值乘完约 .036–.059 —— 属于「材质不是死的」而不是「有东西在动」。
   之前那版会移动的散射光场已删除：它读不出流动，反而让整体发白、滑入变生硬。 */
.dshcps-ultra-haze{
  position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background:radial-gradient(ellipse at 61% 58%,
    rgba(218,204,255,var(--dshcps-haze-alpha)) 0%, rgba(199,187,255,.022) 34%, rgba(199,187,255,0) 72%);
  animation:dshcps-haze-breathe 13.6s ease-in-out infinite;
  animation-delay:-4.2s;
}
@keyframes dshcps-haze-breathe{ 0%,100%{opacity:.55} 50%{opacity:.9} }

/* 星尘跟着同一套时长/缓动被揭示，做到「紫到哪儿、粒子到哪儿」。 */
.dshcps-stars{
  position:absolute; inset:0; pointer-events:none;
  animation:dshcps-ultra-stars-in var(--dshcps-sweep) linear both;
}
/* 粒子跟着同一套两段式揭示：快起手时星尘也只露一小片，不抢在紫色前面。 */
@keyframes dshcps-ultra-stars-in{
  0%{
    clip-path:inset(0 0 0 96% round 999px); opacity:.2;
    animation-timing-function:cubic-bezier(.30,.70,.35,1);
  }
  12%{
    clip-path:inset(0 0 0 65% round 999px); opacity:.85;
    animation-timing-function:cubic-bezier(.28,.06,.30,1);
  }
  100%{clip-path:inset(0 0 0 0% round 999px); opacity:1}
}
/* 星尘 = 固定锚点 + 两层**正交**运动（gpt-6.1-sol 的方案）：
   外层沿一个固定主方向缓慢往返（漂移），内层只在它的**垂直方向**上做一次轻脉冲（颤动）。
   两个方向严格垂直 -> 离锚点的最坏距离就是 sqrt(D²+J²)，可以直接和「邻居间隙预算」比较，
   于是「任意动画相位都不重叠」变成可证明的，而不是靠截图抽样。 */
.dshcps-particle{position:absolute; width:0; height:0}
.dshcps-drift,.dshcps-jitter{position:absolute; left:0; top:0; width:0; height:0}
.dshcps-drift{
  animation:dshcps-dust-drift var(--dshcps-td) linear infinite;
  animation-delay:var(--dshcps-delay-d);
}
@keyframes dshcps-dust-drift{
  0%{transform:translate3d(var(--ndx),var(--ndy),0);animation-timing-function:cubic-bezier(.42,0,.58,1)}
  50%{transform:translate3d(var(--dx),var(--dy),0);animation-timing-function:cubic-bezier(.42,0,.58,1)}
  100%{transform:translate3d(var(--ndx),var(--ndy),0)}
}
/* 单次轻脉冲：静止 → 轻偏移 → 很弱的反向恢复 → 回零。
   只有一次，不安排第二次强反向脉冲，否则重复观看会读成「抽一下、等、再抽一下」；
   每一段端点速度归零/不过冲，所以标量始终落在 [-1,1] 内。 */
.dshcps-jitter{
  animation:dshcps-dust-jitter var(--dshcps-tj) linear infinite;
  animation-delay:var(--dshcps-delay-j);
}
@keyframes dshcps-dust-jitter{
  0%{transform:translate3d(0,0,0);animation-timing-function:linear}
  38%{transform:translate3d(0,0,0);animation-timing-function:cubic-bezier(.35,0,.65,1)}
  46%{transform:translate3d(var(--jx),var(--jy),0);animation-timing-function:cubic-bezier(.40,0,.60,1)}
  57%{transform:translate3d(var(--rjx),var(--rjy),0);animation-timing-function:cubic-bezier(.35,0,.65,1)}
  69%{transform:translate3d(0,0,0);animation-timing-function:linear}
  100%{transform:translate3d(0,0,0)}
}
.dshcps-star{
  position:absolute; display:block; left:0; top:0; border-radius:50%; pointer-events:none;
  width:var(--dshcps-size); height:var(--dshcps-size);
  margin-left:calc(var(--dshcps-size) * -.5); margin-top:calc(var(--dshcps-size) * -.5);
  animation:dshcps-dust-breathe var(--dshcps-tw) ease-in-out infinite;
  animation-delay:var(--dshcps-delay-tw);
}
/* 三层景深：远景小而实、中景有小实核、近景大而虚（用径向渐变软边代替动态 blur） */
.dshcps-star--far{background:#dce5ff}
.dshcps-star--mid{background:radial-gradient(circle,
  rgba(245,244,255,.96) 0%, rgba(225,229,255,.83) 32%, rgba(211,220,255,.34) 64%, rgba(211,220,255,0) 100%)}
.dshcps-star--near{background:radial-gradient(circle,
  rgba(235,231,255,.82) 0%, rgba(218,215,255,.48) 27%, rgba(205,207,255,.14) 58%, rgba(205,207,255,0) 76%)}
/* 只做明暗呼吸，不做缩放 —— 任何额外放大会让视觉半径超出碰撞预算。 */
@keyframes dshcps-dust-breathe{
  0%,100%{opacity:var(--dshcps-o-low)}
  50%{opacity:var(--dshcps-o)}
}
/* 拖柄溅射：原版量到的是一圈**深蓝紫「墨点」**（比卡片底更暗、更蓝），不是发光白点 ——
   白点会和轨道里的星尘混成一类。用户确认它是**一次性飞溅出来然后消失**：
   从柄缘起飞、边飞边淡、约 500ms 后整组不见，不常驻、不循环、不留在原地。 */
.dshcps-ink-ring{
  position:absolute; top:50%; width:0; height:0; overflow:visible;
  pointer-events:none; z-index:2;
}
.dshcps-ink-ray{
  position:absolute; left:0; top:0; width:0; height:0;
  opacity:0; transform:translate3d(var(--x0),var(--y0),0);
}
.dshcps-ink-ray::before{
  content:''; position:absolute; left:0; top:0;
  width:var(--size); height:var(--size); border-radius:50%;
  background:var(--ink); transform:translate(-50%,-50%);
}
.dshcps-ink-ring.is-bursting .dshcps-ink-ray{
  animation-name:dshcps-ink-fly,dshcps-ink-fade;
  animation-duration:var(--duration),var(--duration);
  animation-delay:var(--delay,0ms),var(--delay,0ms);
  animation-timing-function:cubic-bezier(.16,.58,.30,1),linear;
  animation-iteration-count:1,1;
  animation-fill-mode:both,both;
}
/* 只管位移：不在最远处停住等淡出 */
@keyframes dshcps-ink-fly{
  from{transform:translate3d(var(--x0),var(--y0),0)}
  to{transform:translate3d(var(--x1),var(--y1),0)}
}
/* 只管透明度：42% 之后边飞边淡 */
@keyframes dshcps-ink-fade{
  0%{opacity:.85}
  12%,42%{opacity:1}
  100%{opacity:0}
}
@media (prefers-reduced-motion:reduce){
  .dshcps-ultra,.dshcps-ultra-haze,
  .dshcps-drift,.dshcps-jitter,.dshcps-star{animation:none}
  /* 直接停在扫描终态；底光保持常亮（不呼吸），材质仍然「有光」 */
  .dshcps-ultra{background-position:0 0, 100% 0%}
  .dshcps-ultra-haze{opacity:1}
  .dshcps-drift,.dshcps-jitter{transform:translate3d(0,0,0)}
  .dshcps-star{opacity:var(--dshcps-o)}
  .dshcps-ink-ring{display:none}
}
/* 刻度和轨道一起瘦身：2px、低对比（sol：282px 宽下再铺五个文字标签会挤） */
.dshcps-dot{
  position:absolute; top:50%; width:2px; height:2px; margin:-1px 0 0 -1px; border-radius:50%;
  background:var(--dshcps-dot); transition:background .18s ease;
}
.dshcps-dot.is-passed{background:rgba(255,255,255,.45)}
.dshcps-knob{
  position:absolute; top:50%; width:${KNOB_D}px; height:${KNOB_D}px; border-radius:50%; background:var(--dshcps-knob);
  z-index:3;
  transform:translate(-50%,-50%); box-shadow:0 2px 10px rgba(0,0,0,.38),0 0 0 1px rgba(0,0,0,.05);
  transition:left .24s cubic-bezier(.2,0,0,1); will-change:left;
}
.dshcps-track.is-dragging{cursor:grabbing}
.dshcps-track.is-dragging .dshcps-knob{transition:none;transform:translate(-50%,-50%) scale(1.045)}
.dshcps-track.is-locked{cursor:default;opacity:.6}

/* ---------- 模型二级面板：原生 option 行语言 ----------
   行高 / padding / 圆角 / hover 全部照原生：min-height 34、padding 5px 7px、radius md。 */
.dshcps-back{
  display:flex; align-items:center; gap:6px; flex:none;
  width:100%; height:34px; padding:0 ${CTRL_PAD}px; box-sizing:border-box;
  border:0; border-radius:var(--dsw-radius-md); background:0 0;
  color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px;
  line-height:20px; text-align:left; cursor:pointer;
}
.dshcps-back:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshcps-backChev{flex:none;width:12px;height:12px;color:var(--dsw-alias-menu-icon);transform:rotate(180deg)}
.dshcps-list{min-height:0;overflow-y:auto;overscroll-behavior:contain}
.dshcps-group-head{display:block;padding:6px ${CTRL_PAD}px 3px}
.dshcps-group-name{font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dshcps-group-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}
.dshcps-row{
  box-sizing:border-box; display:flex; align-items:center; gap:6px;
  width:100%; min-height:34px; padding:5px 7px; border:0; border-radius:var(--dsw-radius-md);
  background:0 0; color:inherit; font:inherit; font-size:13px; line-height:18px;
  text-align:left; cursor:pointer;
}
.dshcps-row:hover:not(:disabled),.dshcps-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dshcps-row:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dshcps-row-name{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshcps-row-effort{flex:none;font-size:11px;color:var(--dshcps-dim)}
.dshcps-check{flex:0 0 14px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}
.dshcps-check svg{width:14px;height:14px}
.dshcps-empty{padding:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshcps-tip{
  position:fixed; z-index:1201; max-width:${TIP_W}px; padding:6px 10px; border-radius:10px;
  background:var(--dshcps-tip); color:var(--dshcps-tip-text); font-size:11.5px; line-height:1.5;
  box-shadow:var(--dshcps-shadow); pointer-events:none; animation:dshcps-pop-in .13s ease;
}
@keyframes dshcps-pop-in{from{opacity:0}to{opacity:1}}
.dshcps-error{padding:0 ${CTRL_PAD}px 6px;font-size:11px;color:var(--dsw-alias-state-error-primary,#e5484d)}
.dshcps-note{padding:0 ${CTRL_PAD}px 6px;font-size:11px;color:var(--dsw-alias-label-caption)}
`

    if (typeof document !== 'undefined' && !document.querySelector('style[data-dshcps]')) {
      const style = document.createElement('style')
      style.dataset.dshcps = '1'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ======================================================================
     * 三、小工具
     * ==================================================================== */
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

    function hashSeed(text) {
      let hash = 2166136261
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    /** 确定性伪随机：同一个档位每次渲染星点位置一致。 */
    function makeRandom(seed) {
      let state = seed >>> 0
      return () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    /** 档位显示文案：DSH 给了 name 就用 DSH 的，否则回落到 Codex 文案。 */
    function tierText(effort, index, total) {
      const id = String((effort && effort.id) || '')
      const lower = id.toLowerCase()
      if (lower === 'ultra') {
        return {
          short: (effort && effort.name) || 'Ultra',
          full: (effort && effort.name) || 'Ultra',
          desc: (effort && effort.description) || '针对高难度问题提供更深入的分析',
        }
      }
      const hasOwnName = effort && typeof effort.name === 'string' && effort.name.length > 0 && effort.name !== id
      if (hasOwnName) {
        return { short: effort.name, full: effort.name, desc: effort.description || '' }
      }
      let tier = CODEX_TIER_BY_ID[lower]
      if (tier === undefined) tier = clamp(total <= 1 ? 2 : Math.round((index / Math.max(1, total - 1)) * 4), 0, 4)
      const preset = CODEX_TIERS[tier]
      return { short: preset.short, full: preset.full, desc: (effort && effort.description) || preset.desc }
    }

    function flattenModels(catalog) {
      const out = []
      if (!catalog || !Array.isArray(catalog.groups)) return out
      for (const group of catalog.groups) {
        if (!group || !Array.isArray(group.models)) continue
        for (const model of group.models) out.push({ provider: group.id, group, model })
      }
      return out
    }

    function findEntry(entries, selection) {
      if (!selection) return null
      return (
        entries.find((e) => e.provider === selection.provider && e.model.id === selection.model) || null
      )
    }

    function effortIndexOf(model, effortId) {
      const efforts = (model && model.reasoning && model.reasoning.efforts) || []
      if (!efforts.length) return -1
      const found = efforts.findIndex((e) => e.id === effortId)
      return found >= 0 ? found : 0
    }

    function CheckIcon() {
      return h(
        'svg',
        { className: 'dshcps-check', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3.2 8.4l3.1 3.1 6.5-7',
          stroke: 'currentColor',
          strokeWidth: '1.7',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function ChevronIcon({ size = 11, rotate = false }) {
      return h(
        'svg',
        {
          className: 'dshcps-triggerChev' + (rotate ? ' is-open' : ''),
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M6 3.5L10.5 8 6 12.5',
          stroke: 'currentColor',
          strokeWidth: '1.6',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** 原生 trigger 的下拉箭头：朝下、打开时旋转 180°。 */
    function ChevronDownIcon({ size = 12, open = false }) {
      return h(
        'svg',
        {
          className: 'dshcps-triggerChev' + (open ? ' is-open' : ''),
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M4 6l4 4 4-4',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    

    

    /**
     * 浮尘参数表：24 颗、三层景深（远景小而实 / 中景有实核 / 近景大而虚）。
     * 位置做水平分层抖动，避免纯随机挤成一团；X / Y 各自一个周期，
     * 合起来是弯曲轨迹而不是直线往返，也不会全体同步。
     * 一次性生成（模块级），不参与组件每次 render。
     */
    function makeDust(seed) {
      const random = makeRandom(seed)
      const between = (min, max) => min + random() * (max - min)
      const shuffle = (list) => {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1))
          const swap = list[i]
          list[i] = list[j]
          list[j] = swap
        }
        return list
      }
      // 轨道坐标系：x 从 0 到轨道宽，y 从 0 到轨道高
      const H = TRACK_H
      const W = TRACK_W
      // 只用胶囊轨道的中央矩形，并且把拖柄（满位移位置）整块让开
      const x0 = H / 2
      const x1 = Math.min(W - H / 2, W - TRACK_INSET - KNOB_D / 2)
      // —— 运动目标幅度与周期 ——
      // 幅度故意定得**比空间预算大**：预算才是唯一硬约束
      //（allowed = 0.45 × 到最近邻的边缘间隙，且不越界），
      // 于是每颗粒子都会动到「自己那块空间允许的上限」。
      // 周期必须短到**一眼能看出在动**：位移已在预算上限（2-3px），
      // 所以能不能被看见几乎只取决于周期 —— 8-14s 一轮等于静止，
      // 放到 2.6-6s 一轮，峰值速度约 2π·3/4 ≈ 4.7px/s，才读得出「漂浮」。
      // 近景（最大、最显眼）两颗**都**带垂直脉冲 —— 之前只给 1 颗，
        // 用户看到的就是「大粒子不动」。远景多、单颗小，少几颗带脉冲看不出来。
      const specs = [
        { kind: 'far', count: 18, jitterCount: 8, size: [0.85, 1.6], drift: [2.2, 3.2], jitter: [0.6, 1.0], period: [3.4, 6.0], jitterPeriod: [1.4, 2.4], opacity: [0.3, 0.62] },
        { kind: 'mid', count: 4, jitterCount: 3, size: [1.8, 2.6], drift: [2.6, 3.6], jitter: [0.8, 1.3], period: [3.0, 5.2], jitterPeriod: [1.2, 2.0], opacity: [0.5, 0.72] },
        { kind: 'near', count: 2, jitterCount: 2, size: [3.0, 3.6], drift: [3.0, 4.0], jitter: [1.2, 1.8], period: [2.6, 4.4], jitterPeriod: [1.0, 1.8], opacity: [0.28, 0.43] },
      ]
      const out = []
      for (const spec of specs) {
        const flags = shuffle(Array.from({ length: spec.count }, (_, i) => i < spec.jitterCount))
        for (let i = 0; i < spec.count; i++) {
          // 主漂移方向：相对水平 ±25°；颤动方向严格垂直于它
          const theta = (between(-25, 25) * Math.PI) / 180
          out.push({
            kind: spec.kind,
            size: between(spec.size[0], spec.size[1]),
            opacity: between(spec.opacity[0], spec.opacity[1]),
            ux: Math.cos(theta),
            uy: Math.sin(theta),
            vx: -Math.sin(theta),
            vy: Math.cos(theta),
            targetD: between(spec.drift[0], spec.drift[1]),
            targetJ: flags[i] ? between(spec.jitter[0], spec.jitter[1]) : 0,
            driftPeriod: between(spec.period[0], spec.period[1]),
            jitterPeriod: between(spec.jitterPeriod[0], spec.jitterPeriod[1]),
            tw: between(5.3, 9.1),
          })
        }
      }
      // 打散景深层的左右顺序，免得 18 颗远景连续排成一段
      shuffle(out)
      const cell = (x1 - x0) / out.length
      out.forEach((p, i) => {
        p.id = i
        // 每颗只在自己的条带中心 ±15% 内落点：条带留边只改善布局，
        // 真正的保证来自下面的预算公式
        p.x = x0 + (i + 0.5 + between(-0.15, 0.15)) * cell
        p.y = between(4, H - 4)
      })
      // 预算：每颗的运动包络 <= 它在该对间隙里的**半径份额** × 0.9，且不越出边界。
      // 按半径分配而不是对半分 —— 否则大粒子（半径大、吃掉更多间隙）反而动得最少，
      // 视觉上最显眼的粒子最死板。份额和恒为 0.9 < 1，全相位保证不变。
      for (let i = 0; i < out.length; i++) {
        const p = out[i]
        const r = p.size / 2
        let allowed = Infinity
        for (let j = 0; j < out.length; j++) {
          if (i === j) continue
          const q = out[j]
          const rq = q.size / 2
          const slack = Math.hypot(p.x - q.x, p.y - q.y) - r - rq - DUST_GAP
          const share = DUST_SHARE_TOTAL * (r / (r + rq))
          const budget = share * slack
          if (budget < allowed) allowed = budget
        }
        const edgeBudget = Math.min(p.x - x0, x1 - p.x, p.y, H - p.y) - r - DUST_EDGE
        allowed = Math.max(0, Math.min(allowed, edgeBudget))
        const wanted = Math.hypot(p.targetD, p.targetJ)
        const scale = wanted > 0 ? Math.min(1, allowed / wanted) : 1
        const D = p.targetD * scale
        const J = p.targetJ * scale
        p.dx = p.ux * D
        p.dy = p.uy * D
        p.jx = p.vx * J
        p.jy = p.vy * J
        // 方向正交 => 包络就是 sqrt(D²+J²)
        p.envelope = Math.hypot(D, J)
        const tw = p.tw
        p.style = {
          left: p.x.toFixed(2) + 'px',
          top: p.y.toFixed(2) + 'px',
          '--dshcps-size': p.size.toFixed(3) + 'px',
          '--dshcps-o': p.opacity.toFixed(3),
          '--dshcps-o-low': (p.opacity * between(0.6, 0.78)).toFixed(3),
          '--dshcps-tw': tw.toFixed(3) + 's',
          '--dshcps-delay-tw': (-random() * tw).toFixed(3) + 's',
          '--dx': p.dx.toFixed(3) + 'px',
          '--dy': p.dy.toFixed(3) + 'px',
          '--ndx': (-p.dx).toFixed(3) + 'px',
          '--ndy': (-p.dy).toFixed(3) + 'px',
          '--jx': p.jx.toFixed(3) + 'px',
          '--jy': p.jy.toFixed(3) + 'px',
          '--rjx': (-0.22 * p.jx).toFixed(3) + 'px',
          '--rjy': (-0.22 * p.jy).toFixed(3) + 'px',
          '--dshcps-td': p.driftPeriod.toFixed(3) + 's',
          '--dshcps-tj': p.jitterPeriod.toFixed(3) + 's',
          // 随机负延迟：从第一帧起就各处在自己的相位，切档时不会一起出发
          '--dshcps-delay-d': (-random() * p.driftPeriod).toFixed(3) + 's',
          '--dshcps-delay-j': (-random() * p.jitterPeriod).toFixed(3) + 's',
        }
      }
      // 全相位审计：最坏情况下（两颗都朝对方偏）实体边缘还剩多少间隙
      let minPairGap = Infinity
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i]
          const b = out[j]
          const worst = Math.hypot(a.x - b.x, a.y - b.y) - a.size / 2 - b.size / 2 - a.envelope - b.envelope
          if (worst < minPairGap) minPairGap = worst
        }
      }
      out.audit = {
        count: out.length,
        jitterCount: out.filter((p) => p.targetJ > 0).length,
        minPairGap,
        maxEnvelope: Math.max(...out.map((p) => p.envelope)),
        maxDrift: Math.max(...out.map((p) => Math.hypot(p.dx, p.dy))),
        maxJitter: Math.max(...out.map((p) => Math.hypot(p.jx, p.jy))),
      }
      return out
    }

    const ULTRA_DUST = makeDust(0x53a91f2d)

    /** 墨点环：角度 / 飞行终点半径 / 点径 / 颜色 / 错峰（46px 拖柄基准，按 INK_SCALE 缩放）。 */
    const INK_SPECS = [
      { angle: -95, radius: 49, size: 7.0, ink: '#20204f', delay: 0 },
      { angle: -63, radius: 46, size: 6.8, ink: '#21214b', delay: 14 },
      { angle: -30, radius: 52, size: 7.2, ink: '#242750', delay: 6 },
      { angle: -2, radius: 48, size: 7.0, ink: '#252851', delay: 22 },
      { angle: 38, radius: 51, size: 7.4, ink: '#20204f', delay: 10 },
      { angle: 86, radius: 45, size: 6.6, ink: '#21214b', delay: 28 },
      { angle: 163, radius: 47, size: 7.0, ink: '#242750', delay: 16 },
      { angle: 220, radius: 50, size: 7.2, ink: '#252851', delay: 4 },
    ]
    const INK_START_RADIUS = 24
    const INK_START_DELAY = 70
    const INK_DURATION = 400
    /** 整组从触发到完全消失：起步延迟 + 单颗时长 + 最大错峰。 */
    const INK_TOTAL = INK_START_DELAY + INK_DURATION + 28

    function DustParticle({ particle }) {
      const star = h('span', { className: 'dshcps-star dshcps-star--' + particle.kind })
      return h(
        'span',
        { className: 'dshcps-particle', style: particle.style },
        h(
          'span',
          { className: 'dshcps-drift' },
          h('span', { className: 'dshcps-jitter' }, star),
        ),
      )
    }

    /** 最高档：滑动的紫蓝材质 + 极弱底光 + 24 颗浮尘，粒子跟着材质一起从右往左铺开。
     *  铺满之后**没有任何会移动的光**：亮高光只随扫描飘过一次（用户明确要求）。 */
    function UltraLayer() {
      return h(
        'div',
        { className: 'dshcps-ultra', 'aria-hidden': 'true' },
        h('div', { className: 'dshcps-ultra-haze' }),
        h(
          'div',
          { className: 'dshcps-stars' },
          ULTRA_DUST.map((particle) => h(DustParticle, { key: particle.id, particle })),
        ),
      )
    }

    /**
     * 拖柄溅射（一次性）：8 颗深蓝紫墨点从柄缘起飞、边飞边淡、约 500ms 后整组消失。
     * 靠 key 重挂载来重播；不常驻、不循环，离开最高档立即消失。
     */
    function InkRing({ knobLeft, playKey }) {
      return h(
        'div',
        {
          key: playKey,
          className: 'dshcps-ink-ring is-bursting',
          style: { left: knobLeft },
          'aria-hidden': 'true',
        },
        INK_SPECS.map((spec, i) => {
          const angle = (spec.angle * Math.PI) / 180
          const startRadius = INK_START_RADIUS * INK_SCALE
          const endRadius = spec.radius * INK_SCALE
          return h('span', {
            key: i,
            className: 'dshcps-ink-ray',
            style: {
              '--x0': (Math.cos(angle) * startRadius).toFixed(2) + 'px',
              '--y0': (Math.sin(angle) * startRadius).toFixed(2) + 'px',
              '--x1': (Math.cos(angle) * endRadius).toFixed(2) + 'px',
              '--y1': (Math.sin(angle) * endRadius).toFixed(2) + 'px',
              '--size': (spec.size * INK_SCALE).toFixed(2) + 'px',
              '--ink': spec.ink,
              '--duration': INK_DURATION + 'ms',
              '--delay': INK_START_DELAY + spec.delay + 'ms',
            },
          })
        }),
      )
    }

    /* ======================================================================
     * 四、数据钩子：读投影 + 拉目录
     * ==================================================================== */
    function useModelSelection(ctx, sessionId) {
      const [projection, setProjection] = React.useState(null)
      React.useEffect(() => {
        if (!sessionId) return undefined
        let face = null
        try {
          const binding = ctx.sessions.binding(sessionId)
          face = binding && binding.session && binding.session.projections
            ? binding.session.projections.faceOf('modelSelection')
            : null
        } catch (error) {
          face = null
        }
        if (!face || typeof face.getSnapshot !== 'function') return undefined
        const sync = () => setProjection(face.getSnapshot() || null)
        sync()
        const dispose = typeof face.subscribe === 'function' ? face.subscribe(sync) : null
        return () => {
          if (typeof dispose === 'function') dispose()
        }
      }, [ctx, sessionId])
      return projection
    }

    function useModelCatalog(ctx) {
      const [catalog, setCatalog] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        const load = () => {
          Promise.resolve()
            .then(() => ctx.remote.session.modelCatalog())
            .then((result) => {
              if (!alive) return
              if (result && result.ok) setCatalog(result.value)
            })
            .catch(() => {})
        }
        load()
        const disposers = []
        try {
          if (ctx.remote.$on) disposers.push(ctx.remote.$on('llm/adapters-updated', load))
        } catch (error) {}
        try {
          if (ctx.on) disposers.push(ctx.on('connection/reset', load))
        } catch (error) {}
        return () => {
          alive = false
          for (const dispose of disposers) {
            try {
              if (typeof dispose === 'function') dispose()
            } catch (error) {}
          }
        }
      }, [ctx])
      return catalog
    }

    /* ======================================================================
     * 五、主组件
     * ==================================================================== */
    function PowerSlider(props) {
      const { sessionId, locked } = props
      const ctx = props.__ctx

      const [open, setOpen] = React.useState(false)
      const [view, setView] = React.useState('root')
      const [dragIndex, setDragIndex] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [hovered, setHovered] = React.useState(null)
      const [pos, setPos] = React.useState(null)
      const [subPos, setSubPos] = React.useState(null)
      // 拖柄溅射：非 0 时挂载墨点环并播放一次，播完（或离开最高档）归 0
      const [burstKey, setBurstKey] = React.useState(0)

      const anchorRef = React.useRef(null)
      const popRef = React.useRef(null)
      const trackRef = React.useRef(null)
      const entryRef = React.useRef(null)

      const projection = useModelSelection(ctx, sessionId)
      const catalog = useModelCatalog(ctx)
      const entries = React.useMemo(() => flattenModels(catalog), [catalog])

      const fallback = catalog && catalog.default ? catalog.default : null
      const current = (projection && (projection.next || projection.lastUsed)) || fallback
      const entry = findEntry(entries, current)

      const model = entry ? entry.model : null
      const efforts = (model && model.reasoning && model.reasoning.efforts) || []
      const defaultEffortId = (model && model.reasoning && model.reasoning.defaultEffort) || (efforts[0] && efforts[0].id)
      const activeEffortId = (current && current.reasoningEffort) || defaultEffortId
      const realIndex = effortIndexOf(model, activeEffortId)
      const index = dragIndex === null ? realIndex : dragIndex
      const total = efforts.length
      const isUltra = total >= 3 && index === total - 1
      const effort = total ? efforts[clamp(index, 0, total - 1)] : null
      const text = effort ? tierText(effort, index, total) : null

      /* ---------- 拖柄溅射：进入最高档时玩一次，约 0.5s 后整组消失 ---------- */
      React.useEffect(() => {
        if (!isUltra) {
          setBurstKey(0)
          return undefined
        }
        setBurstKey((n) => n + 1)
        const timer = setTimeout(() => setBurstKey(0), INK_TOTAL)
        return () => clearTimeout(timer)
      }, [isUltra])

      /* ---------- 位置：浮在触发器上方 ---------- */
      const place = React.useCallback(() => {
        const anchor = anchorRef.current
        const pop = popRef.current
        if (!anchor || !pop) return
        const rect = anchor.getBoundingClientRect()
        const width = pop.offsetWidth || PANEL_W
        const height = pop.offsetHeight || 200
        const left = clamp(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, window.innerWidth - width - 8))
        let top = rect.top - 12 - height
        if (top < 8) top = Math.min(window.innerHeight - height - 8, rect.bottom + 12)
        setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
        const entry = entryRef.current
        if (entry) {
          const er = entry.getBoundingClientRect()
          const sh = 360
          let stop = er.bottom + 6
          if (stop + 120 > window.innerHeight - 8) stop = Math.max(8, er.top - 6 - Math.min(sh, window.innerHeight - 40))
          setSubPos({ left, top: stop })
        }
      }, [])

      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null)
          return undefined
        }
        place()
        const onChange = () => place()
        window.addEventListener('resize', onChange)
        window.addEventListener('scroll', onChange, true)
        return () => {
          window.removeEventListener('resize', onChange)
          window.removeEventListener('scroll', onChange, true)
        }
      }, [open, place, view, total])

      /* ---------- 关闭行为 ---------- */
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const pop = popRef.current
          const anchor = anchorRef.current
          if (pop && pop.contains(event.target)) return
          if (anchor && anchor.contains(event.target)) return
          setOpen(false)
          setView('root')
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (view === 'models') {
            setView('root')
          } else {
            setOpen(false)
          }
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open, view])

      /* ---------- 写入 ---------- */
      const commit = React.useCallback(
        async (next) => {
          if (!sessionId || !next || !next.provider || !next.model) return
          setBusy(true)
          setError('')
          try {
            const request = { sessionId, provider: next.provider, model: next.model }
            if (next.reasoningEffort !== undefined && next.reasoningEffort !== null && next.reasoningEffort !== '') {
              request.reasoningEffort = next.reasoningEffort
            }
            const result = await ctx.remote.session.selectModel(request)
            if (!result || !result.ok) {
              const code = result && result.error ? result.error.code : ''
              const message = result && result.error ? result.error.message : '模型选择失败'
              setError(code === 'session/writer-held' ? '会话被其他 DSH 进程占用，请退出后重试。' : message)
            }
          } catch (cause) {
            setError(String((cause && cause.message) || cause))
          } finally {
            setBusy(false)
          }
        },
        [ctx, sessionId],
      )

      const setEffortAt = React.useCallback(
        (nextIndex) => {
          if (!total || locked || busy) return
          const target = efforts[clamp(nextIndex, 0, total - 1)]
          if (!target || !current) return
          if (target.id === activeEffortId) return
          commit({ provider: current.provider, model: current.model, reasoningEffort: target.id })
        },
        [total, locked, busy, efforts, current, activeEffortId, commit],
      )

      const pickModel = React.useCallback(
        (nextEntry) => {
          const nextEfforts = (nextEntry.model.reasoning && nextEntry.model.reasoning.efforts) || []
          const keep = nextEfforts.some((e) => e.id === activeEffortId)
          const nextEffort =
            (keep ? activeEffortId : undefined) ||
            (nextEntry.model.reasoning && nextEntry.model.reasoning.defaultEffort) ||
            (nextEfforts[0] && nextEfforts[0].id)
          setView('root')
          setHovered(null)
          commit({ provider: nextEntry.provider, model: nextEntry.model.id, reasoningEffort: nextEffort })
        },
        [activeEffortId, commit],
      )

      /* ---------- 拖拽 ---------- */
      const indexFromClientX = React.useCallback(
        (clientX) => {
          const track = trackRef.current
          if (!track || total <= 1) return 0
          const rect = track.getBoundingClientRect()
          const radius = TRACK_INSET
          const usable = Math.max(1, rect.width - radius * 2)
          const ratio = clamp((clientX - rect.left - radius) / usable, 0, 1)
          return Math.round(ratio * (total - 1))
        },
        [total],
      )

      const canUse = !!model && total > 0 && !locked
      const canOpen = !!model || !!catalog
      const onTrackDown = (event) => {
        if (!canUse) return
        event.preventDefault()
        const next = indexFromClientX(event.clientX)
        setDragIndex(next)
        const move = (moveEvent) => setDragIndex(indexFromClientX(moveEvent.clientX))
        const up = (upEvent) => {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', up)
          const finalIndex = indexFromClientX(upEvent.clientX)
          setDragIndex(null)
          setEffortAt(finalIndex)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', up)
      }

      const onTrackKeyDown = (event) => {
        if (!canUse) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          setEffortAt(index - 1)
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          setEffortAt(index + 1)
        }
      }

      /* ---------- 悬停说明气泡 ---------- */
      const tipStyle = React.useMemo(() => {
        if (!hovered) return null
        const width = TIP_W
        const left = clamp(hovered.right + 10, 8, Math.max(8, window.innerWidth - width - 8))
        const flip = hovered.right + 10 + width > window.innerWidth - 8
        return {
          left: flip ? Math.max(8, hovered.left - width - 10) : left,
          top: clamp(hovered.top + hovered.height / 2, 40, window.innerHeight - 40),
          transform: 'translateY(-50%)',
        }
      }, [hovered])

      if (!sessionId) return null

      const ratio = total > 1 ? index / (total - 1) : 0
      const knobLeft = posAt(ratio)
      const modelLabel = model ? model.name : '选择模型'
      const effortLabel = text ? text.short : ''

      /* 收起态：结构、类名层次、数值全部对齐原生 ModelSelect trigger。
         最高档在这里**不加**渐变 / 紫点 / 描边 —— 「深入」两个字本身就是表达。 */
      const triggerNode = h(
        'button',
        {
          ref: anchorRef,
          type: 'button',
          className: 'dshcps-trigger',
          disabled: !canOpen,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': modelLabel + (effortLabel ? '，思考强度 ' + effortLabel : ''),
          title: modelLabel + (effortLabel ? ' · ' + effortLabel : ''),
          onClick: () => {
            setOpen((value) => !value)
            setView('root')
          },
        },
        h('span', { className: 'dshcps-triggerLabel' }, modelLabel),
        effortLabel ? h('span', { className: 'dshcps-triggerEffort' }, effortLabel) : null,
        h(ChevronDownIcon, { open }),
      )

      /* 思考强度控制区：标题行（左标签 / 右当前值）+ 紧凑滑杆 + 固定说明位。
         额度提醒不再和模型名互相替换 —— 模型已经有自己的行了。 */
      const sliderNode = h(
        'div',
        {
          ref: trackRef,
          className:
            'dshcps-track' + (dragIndex !== null ? ' is-dragging' : '') + (canUse ? '' : ' is-locked'),
          role: 'slider',
          tabIndex: canUse ? 0 : -1,
          'aria-label': '思考强度',
          'aria-valuemin': 1,
          'aria-valuemax': total || 1,
          'aria-valuenow': total ? index + 1 : 1,
          'aria-valuetext': text ? text.full : '',
          onPointerDown: onTrackDown,
          onKeyDown: onTrackKeyDown,
        },
        h(
          'div',
          { className: 'dshcps-fill', style: { width: total > 0 ? knobLeft : '0px' } },
          isUltra ? h(UltraLayer) : null,
        ),
        h(
          'div',
          { className: 'dshcps-dots' },
          efforts.map((item, i) =>
            h('span', {
              key: item.id,
              className: 'dshcps-dot' + (i <= index ? ' is-passed' : ''),
              style: { left: posAt(total > 1 ? i / (total - 1) : 0) },
            }),
          ),
        ),
        // 墨点环在拖柄**之前**渲染；只有正在播溅射时才挂载
        burstKey > 0 ? h(InkRing, { knobLeft, playKey: burstKey }) : null,
        total > 0 ? h('div', { className: 'dshcps-knob', style: { left: knobLeft } }) : null,
      )

      let panel = null
      if (open) {
        const groups = (catalog && catalog.groups) || []

        /* 单个面板，不分级（用户：照着原生菜单那样做）：
             思考强度 + 当前档位
             ━━━●━━━━━━━━━━━━━━
             （最高档时）使用额度消耗更快
             ────────────────
             选择模型
             默认 / 推荐模型集
             6.1 Sol ✓ …
           模型行、分组标题、对勾、右侧悬浮说明全部沿用原生菜单的语言。 */
        const content = [
          error ? h('div', { key: 'err', className: 'dshcps-error' }, error) : null,
          h(
            'section',
            { key: 'ctrl', className: 'dshcps-control', 'aria-labelledby': 'dshcps-effort-label' },
            h(
              'div',
              { className: 'dshcps-heading' },
              h('span', { id: 'dshcps-effort-label' }, '思考强度'),
              h('span', { className: 'dshcps-value' + (isUltra ? ' is-ultra' : '') }, effortLabel || '—'),
            ),
            h('div', { className: 'dshcps-slot' }, sliderNode),
            h(
              'div',
              { className: 'dshcps-help' },
              isUltra ? h('span', { className: 'dshcps-hint' }, QUOTA_HINT) : null,
            ),
            total === 0
              ? h(
                  'div',
                  { className: 'dshcps-note' },
                  locked ? '推理强度不可调整' : '当前模型未公布推理强度：在 profile 的 reasoningEfforts 里配置后即可调节',
                )
              : null,
          ),
          h('div', { key: 'div', className: 'dshcps-divider', 'aria-hidden': 'true' }),
          h(
            'button',
            {
              key: 'entry',
              ref: entryRef,
              type: 'button',
              className: 'dshcps-entry',
              disabled: groups.length === 0,
              'aria-haspopup': 'dialog',
              'aria-expanded': view === 'models' ? 'true' : 'false',
              'aria-label': '选择模型，当前 ' + modelLabel,
              onClick: () => {
                setView(view === 'models' ? 'root' : 'models')
                setHovered(null)
              },
            },
            h(
              'span',
              { className: 'dshcps-entryText' },
              h('span', { className: 'dshcps-entryTop' }, (effortLabel || '思考强度') + ' · 当前模型'),
              h('span', { className: 'dshcps-entryName' }, modelLabel),
            ),
            h(ChevronIcon, { size: 12, rotate: view === 'models' }),
          ),
        ]

        const surfaceProps = {
          ref: popRef,
          className: 'dshcps-menu',
          role: 'dialog',
          'aria-label': '模型与思考强度',
          style: pos
            ? { left: pos.left + 'px', top: pos.top + 'px' }
            : { visibility: 'hidden', left: '0px', top: '0px' },
        }
        panel = ReactDOM.createPortal(
          MenuSurface ? h(MenuSurface, surfaceProps, content) : h('div', surfaceProps, content),
          document.body,
        )

        if (view === 'models') {
          const subProps = {
            className: 'dshcps-submenu',
            role: 'dialog',
            'aria-label': '选择模型',
            style: subPos
              ? { left: subPos.left + 'px', top: subPos.top + 'px' }
              : { visibility: 'hidden', left: '0px', top: '0px' },
          }
          const subContent = h(
            'div',
            { className: 'dshcps-list' },
            groups.length === 0
              ? h('div', { className: 'dshcps-empty' }, '模型目录加载中…')
              : groups.map((group, groupIndex) =>
                  h(
                    'div',
                    { key: group.id },
                    h(
                      'div',
                      { className: 'dshcps-group-head' },
                      h('div', { className: 'dshcps-group-name' }, group.name || group.id),
                      groupIndex === 0 ? h('div', { className: 'dshcps-group-sub' }, '推荐模型集') : null,
                    ),
                    (group.models || []).map((item) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          key: group.id + '/' + item.id,
                          className: 'dshcps-row',
                          disabled: busy,
                          onClick: () => pickModel({ provider: group.id, model: item }),
                          onMouseEnter: (event) => {
                            const rect = event.currentTarget.getBoundingClientRect()
                            setHovered({
                              right: rect.right,
                              left: rect.left,
                              top: rect.top,
                              height: rect.height,
                              text: item.description || '',
                              name: item.name || item.id,
                            })
                          },
                          onMouseLeave: () => setHovered(null),
                        },
                        h('span', { className: 'dshcps-row-name' }, item.name || item.id),
                        current && current.provider === group.id && current.model === item.id
                          ? h(CheckIcon, {})
                          : null,
                      ),
                    ),
                  ),
                ),
          )
          panel = h(
            React.Fragment,
            null,
            panel,
            ReactDOM.createPortal(
              MenuSurface ? h(MenuSurface, subProps, subContent) : h('div', subProps, subContent),
              document.body,
            ),
          )
        }

        if (hovered && hovered.text) {
          panel = h(
            React.Fragment,
            null,
            panel,
            ReactDOM.createPortal(
              h('div', { className: 'dshcps-tip', style: tipStyle }, hovered.text),
              document.body,
            ),
          )
        }
      }

      return h('div', { className: 'dshcps-root' }, triggerNode, panel)
    }

    /* ======================================================================
     * 六、插件挂载
     * ==================================================================== */
    function apply(ctx) {
      const Bound = (props) => h(PowerSlider, Object.assign({}, props, { __ctx: ctx }))
      Bound.displayName = 'CodexPowerSlider'

      try {
        // priority: -1 => 遮蔽原生 ModelSelect（single 槽「越低越优先」），接管这个位置。
        // 收起态复刻原生 trigger，展开态是「模型行 + 思考强度滑杆」的合并面板。
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register({ name: SLOT, priority: SLOT_PRIORITY, locale: NAMESPACE }, Bound),
        )
      } catch (cause) {
        // 挂载点尚未声明时 inject 会等；真正的异常只记录，不影响其它插件。
        if (typeof console !== 'undefined') console.warn('[dsh-codex-power-slider] 挂载失败：', cause)
      }
    }

    const module = { name: PLUGIN_ID, inject: ['slots', 'sessions', 'remote', 'remote.session'], apply }
    void NAMESPACE
    return module
  },
})
