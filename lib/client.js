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

    const PLUGIN_ID = 'dsh-codex-power-slider'
    /** 挂载点：composer 工具条里一个空闲的 list slot（左侧）。 */
    const SLOT = 'conversation.input.left'
    const NAMESPACE = 'dsh-codex-power-slider'

    /* 几何：卡片 / 轨道 / 拖柄的尺寸集中在这里，CSS 与拖拽计算共用同一组常量，
       避免两头各写一份数字对不上。 */
    const CARD_W = 282
    const CARD_PAD = 15
    const TRACK_H = 26
    const KNOB_D = 29
    const TRACK_INSET = TRACK_H / 2
    const TIP_W = 210
    /** 墨点环按拖柄直径等比缩放（基准是 46px 拖柄的那组测量值）。 */
    const INK_SCALE = KNOB_D / 46
    /** 最高档「深入」时第二行显示的额度提醒（原版原文）。 */
    const QUOTA_HINT = '使用额度消耗更快'
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
/* 触发器与浮层共用一套 token 作用域：卡片是 portal 到 document.body 的，
   不再是 .dshcps-root 的后代，所以两处都必须声明变量。 */
.dshcps-root,.dshcps-pop,.dshcps-tip{
  --dshcps-card:#2d2d2d; --dshcps-line:rgba(255,255,255,.06);
  --dshcps-accent:#447ac6; --dshcps-accent-dim:#2f5fa8;
  --dshcps-sub:#a8a8a8; --dshcps-sub-hover:#d4d4d4; --dshcps-icon:#808181;
  --dshcps-track:#3f3f3f; --dshcps-dot:#636363; --dshcps-knob:#ffffff;
  --dshcps-panel:#2c2c2c; --dshcps-row-hover:#3a3a3a; --dshcps-row:#d4d4d4;
  --dshcps-dim:#808181; --dshcps-tip:#323232; --dshcps-tip-text:#d4d4d4;
  --dshcps-shadow:0 18px 48px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.35);
}
.dshcps-root{display:inline-flex; align-items:center; font-family:var(--dsw-font-family,system-ui,sans-serif)}
.dshcps-pop,.dshcps-tip{font-family:var(--dsw-font-family,system-ui,sans-serif)}
body:not([data-ds-dark-theme]) .dshcps-root,
body:not([data-ds-dark-theme]) .dshcps-pop,
body:not([data-ds-dark-theme]) .dshcps-tip{
  --dshcps-card:#ffffff; --dshcps-line:rgba(0,0,0,.07);
  --dshcps-sub:#6b6b6b; --dshcps-sub-hover:#111111; --dshcps-icon:#8a8a8a;
  --dshcps-track:#ececec; --dshcps-dot:#c4c4c4;
  --dshcps-panel:#ffffff; --dshcps-row-hover:#f1f1f1; --dshcps-row:#161616;
  --dshcps-dim:#8a8a8a; --dshcps-tip:#f6f6f6; --dshcps-tip-text:#161616;
  --dshcps-shadow:0 18px 48px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08);
}

/* ---------- 触发器（composer 工具条里的胶囊） ---------- */
.dshcps-chip{
  display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px;
  border:1px solid var(--dshcps-line); border-radius:999px; background:transparent;
  color:var(--dsw-alias-label-secondary,var(--dshcps-sub)); font:inherit; font-size:12.5px;
  line-height:1; cursor:pointer; white-space:nowrap;
  transition:background .15s ease,color .15s ease,border-color .15s ease;
}
.dshcps-chip:hover:not([disabled]){background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dshcps-sub-hover)}
.dshcps-chip[disabled]{opacity:.45;cursor:default}
.dshcps-chip.is-open{border-color:color-mix(in srgb,var(--dshcps-accent) 55%,transparent);color:var(--dshcps-sub-hover)}
.dshcps-chip-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dshcps-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dshcps-accent) 20%,transparent)}
.dshcps-chip-dot.is-ultra{background:linear-gradient(135deg,#6169d1,#9292fd)}
.dshcps-chip-chev{flex:none;opacity:.75}

/* ---------- 卡片 ---------- */
.dshcps-pop{
  position:fixed; z-index:1200; width:${CARD_W}px; box-sizing:border-box;
  padding:13px ${CARD_PAD}px ${CARD_PAD}px; border-radius:16px; border:1px solid var(--dshcps-line);
  background:var(--dshcps-card); color:var(--dshcps-row); box-shadow:var(--dshcps-shadow);
  animation:dshcps-pop-in .17s cubic-bezier(.2,0,0,1);
}
@keyframes dshcps-pop-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}

.dshcps-head{position:relative;text-align:center}
.dshcps-title{font-size:15px;font-weight:600;line-height:1.25;letter-spacing:.01em;color:var(--dshcps-accent);transition:color .18s ease}
.dshcps-title.is-ultra{
  background:linear-gradient(92deg,#3b3ad0 0%,#8f8ffa 58%,#6169d1 100%);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
}
.dshcps-sub{
  display:inline-flex; align-items:center; gap:2px; padding:0 2px;
  border:0; background:none; font:inherit; font-size:11.5px; color:var(--dshcps-sub);
  cursor:pointer; border-radius:6px; transition:color .15s ease,opacity .12s ease-out;
}
.dshcps-sub:hover{color:var(--dshcps-sub-hover)}
.dshcps-sub:disabled{cursor:default}
.dshcps-sub[disabled]:hover{color:var(--dshcps-sub)}
.dshcps-reset{
  position:absolute; top:-2px; right:-4px; width:23px; height:23px; display:grid; place-items:center;
  border:0; background:none; padding:0; color:var(--dshcps-icon); cursor:pointer; border-radius:7px;
  transition:background .15s ease,color .15s ease;
}
.dshcps-reset:hover{background:var(--dshcps-row-hover);color:var(--dshcps-sub-hover)}
.dshcps-reset[disabled]{opacity:.4;cursor:default}
/* 第二行是两个内容叠在同一个格子里：临时额度提醒 ↔ 可点的模型名。
   纯透明度交叉淡化 120ms、不做位移，所以卡片高度不会跳。 */
.dshcps-subwrap{
  margin-top:2px; display:grid; place-items:center; height:16px; line-height:16px;
  font-size:11.5px; color:var(--dshcps-sub);
}
.dshcps-subwrap>*{grid-area:1 / 1}
/* 额度提醒：原版就是普通副标题灰字 —— 无警示色、无图标、不可点。 */
.dshcps-quota{
  opacity:0; pointer-events:none; user-select:none; white-space:nowrap;
  transition:opacity .12s ease-out;
}
.dshcps-subwrap[data-notice=true] .dshcps-quota{opacity:1}
.dshcps-subwrap[data-notice=true] .dshcps-sub{opacity:0; pointer-events:none}
@media (prefers-reduced-motion:reduce){
  .dshcps-quota,.dshcps-sub{transition:none}
}

/* ---------- 滑杆 ---------- */
.dshcps-track{
  position:relative; margin-top:11px; height:${TRACK_H}px; border-radius:999px;
  background:var(--dshcps-track); cursor:pointer; touch-action:none;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
}
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
/* 材质柔光：只改 opacity，不动 background-position，也不做 blur。 */
.dshcps-ultra-haze{
  position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 61% 58%,
    rgba(218,204,255,.22) 0%, rgba(199,187,255,.08) 34%, rgba(199,187,255,0) 72%);
  animation:dshcps-haze-breathe 11.7s ease-in-out infinite;
  animation-delay:-3.8s;
}
@keyframes dshcps-haze-breathe{ 0%,100%{opacity:.2} 50%{opacity:.49} }

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
/* 固定锚点，不承担动画；X / Y 各自一个周期，合起来不是直线往返也不会全体同步。 */
.dshcps-particle{position:absolute; width:0; height:0}
.dshcps-particle-x,.dshcps-particle-y{position:absolute; left:0; top:0; width:0; height:0}
.dshcps-particle-x{animation:dshcps-dust-x var(--dshcps-tx) ease-in-out infinite; animation-delay:var(--dshcps-delay-x)}
.dshcps-particle-y{animation:dshcps-dust-y var(--dshcps-ty) ease-in-out infinite; animation-delay:var(--dshcps-delay-y)}
@keyframes dshcps-dust-x{
  0%,100%{transform:translate3d(calc(0px - var(--dshcps-ax)),0,0)}
  50%{transform:translate3d(var(--dshcps-ax),0,0)}
}
@keyframes dshcps-dust-y{
  0%,100%{transform:translate3d(0,calc(0px - var(--dshcps-ay)),0)}
  50%{transform:translate3d(0,var(--dshcps-ay),0)}
}
/* 兴奋的抖动 v2：位移做到「看得出来」，但仍只给 14/24 颗。
   每周期两次**不等强**的脉冲（主脉冲到位、次脉冲只有 45–60%），
   单颗实际运动只占周期 20–28%，其余时间静止 —— 所以是「偶尔被轻推一下」，
   不是持续乱颤。方向由 --jx/--jy 这个向量给出。 */
.dshcps-particle-j{position:relative; display:block; width:0; height:0; pointer-events:none}
.dshcps-particle-j.is-jittering{
  animation:dshcps-dust-jitter var(--dshcps-tj,1.6s) linear infinite;
  animation-delay:var(--dshcps-delay-j,0s);
}
@keyframes dshcps-dust-jitter{
  0%,13%{transform:translate3d(0,0,0)}
  17%{transform:translate3d(var(--jx,0.4px),var(--jy,0.4px),0)}
  21%{transform:translate3d(calc(var(--jx,.4px) * -.35),calc(var(--jy,.4px) * -.35),0)}
  29%,57%{transform:translate3d(0,0,0)}
  61%{transform:translate3d(calc(var(--jx,.4px) * -.55),calc(var(--jy,.4px) * -.55),0)}
  66%{transform:translate3d(calc(var(--jx,.4px) * .18),calc(var(--jy,.4px) * .18),0)}
  74%,100%{transform:translate3d(0,0,0)}
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
@keyframes dshcps-dust-breathe{
  0%,100%{opacity:var(--dshcps-o-low);transform:scale(.94)}
  50%{opacity:var(--dshcps-o);transform:scale(1.06)}
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
  .dshcps-particle-x,.dshcps-particle-y,.dshcps-particle-j,.dshcps-star{animation:none}
  .dshcps-star{opacity:var(--dshcps-o)}
  .dshcps-ink-ring{display:none}
}
.dshcps-dot{
  position:absolute; top:50%; width:3px; height:3px; margin:-1.5px 0 0 -1.5px; border-radius:50%;
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

/* ---------- 模型列表 ---------- */
.dshcps-panel-title{padding:2px 2px 6px;font-size:11.5px;color:var(--dshcps-dim)}
.dshcps-group{padding-top:3px}
.dshcps-group-head{display:block;padding:6px 2px 3px}
.dshcps-group-name{font-size:12.5px;font-weight:600;color:var(--dshcps-row);line-height:1.35}
.dshcps-group-sub{font-size:11px;color:var(--dshcps-dim);line-height:1.4}
.dshcps-row{
  position:relative; display:flex; align-items:center; justify-content:space-between; gap:9px;
  width:100%; height:31px; padding:0 8px; box-sizing:border-box; border:0; border-radius:8px;
  background:none; font:inherit; font-size:12.5px; color:var(--dshcps-row); text-align:left; cursor:pointer;
  transition:background .12s ease;
}
.dshcps-row:hover{background:var(--dshcps-row-hover)}
.dshcps-row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshcps-row-effort{flex:none;font-size:11px;color:var(--dshcps-dim)}
.dshcps-check{flex:none;width:14px;height:14px;color:var(--dshcps-row)}
.dshcps-empty{padding:8px 2px;font-size:12px;color:var(--dshcps-dim)}
.dshcps-tip{
  position:fixed; z-index:1201; max-width:${TIP_W}px; padding:6px 10px; border-radius:10px;
  background:var(--dshcps-tip); color:var(--dshcps-tip-text); font-size:11.5px; line-height:1.5;
  box-shadow:var(--dshcps-shadow); pointer-events:none; animation:dshcps-pop-in .13s ease;
}
.dshcps-error{margin-top:6px;font-size:11px;color:var(--dsw-alias-state-error-primary,#e5484d)}
.dshcps-note{margin-top:4px;font-size:11px;color:var(--dshcps-dim);text-align:center}
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

    function ChevronIcon({ size = 11 }) {
      return h(
        'svg',
        {
          className: 'dshcps-chip-chev',
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

    function ResetIcon({ size = 13.5 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M14.2 6.4A6.2 6.2 0 1 0 15 9',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M14.9 2.6v4.1h-4.1',
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
      const out = []
      const count = 24
      // 18 远景 / 4 中景 / 2 近景；抖动取 远 9 / 中 3 / 近 2 = 14/24
      const MID = { 3: 1, 10: 1, 15: 1, 22: 1 }
      const NEAR = { 6: 1, 18: 1 }
      for (let i = 0; i < count; i++) {
        const kind = NEAR[i] ? 'near' : MID[i] ? 'mid' : 'far'
        let size
        let opacity
        let ax
        let ay
        let tx
        let ty
        if (kind === 'near') {
          size = between(3.0, 3.6)
          opacity = between(0.28, 0.43)
          ax = between(5.2, 8.3)
          ay = between(2.3, 4.1)
          tx = between(10, 14)
          ty = between(7.5, 11)
        } else if (kind === 'mid') {
          size = between(1.8, 2.6)
          opacity = between(0.5, 0.72)
          ax = between(3.9, 6.5)
          ay = between(1.9, 3.6)
          tx = between(12, 17)
          ty = between(9, 14)
        } else {
          size = between(0.85, 1.6)
          opacity = between(0.3, 0.62)
          ax = between(2.3, 4.8)
          ay = between(1.4, 2.8)
          tx = between(15, 23)
          ty = between(11, 18)
        }
        const tw = between(5.3, 9.1)
        out.push({
          id: i,
          kind,
          left: 3 + ((i + random()) / count) * 94,
          top: between(13, 87),
          style: {
            '--dshcps-size': size.toFixed(3) + 'px',
            '--dshcps-o': opacity.toFixed(3),
            '--dshcps-o-low': (opacity * between(0.6, 0.78)).toFixed(3),
            '--dshcps-ax': ax.toFixed(3) + 'px',
            '--dshcps-ay': ay.toFixed(3) + 'px',
            '--dshcps-tx': tx.toFixed(3) + 's',
            '--dshcps-ty': ty.toFixed(3) + 's',
            '--dshcps-tw': tw.toFixed(3) + 's',
            // 从第一帧起就处在各自的相位，切档时不会所有粒子一起出发
            '--dshcps-delay-x': (-random() * tx).toFixed(3) + 's',
            '--dshcps-delay-y': (-random() * ty).toFixed(3) + 's',
            '--dshcps-delay-tw': (-random() * tw).toFixed(3) + 's',
          },
        })
      }
      // 显眼的几颗不落在同一条水平线上，也不等距：纵向位置由左到右手工打散
      const spread = [32, 67, 43, 72, 55, 24, 80, 38]
      out
        .filter((p) => p.kind !== 'far')
        .sort((a, b) => a.left - b.left)
        .forEach((p, i) => {
          p.top = spread[i % spread.length]
        })
      // 兴奋的抖动：位移做到看得出来，14/24 颗。
      // 「位移」是相对静止位置的最大**径向**距离（不是两轴各自的上限），
      // 方向由一个随机向量给出；周期按景深分配，近景最快最大，远景维持空间。
      const JITTER = {
        far: { count: 9, min: 0.60, max: 1.00, period: [1.35, 1.70] },
        mid: { count: 3, min: 1.10, max: 1.70, period: [1.15, 1.45] },
        near: { count: 2, min: 1.80, max: 2.35, period: [1.05, 1.25] },
      }
      for (const depth of ['far', 'mid', 'near']) {
        const conf = JITTER[depth]
        const pool = out.filter((p) => p.kind === depth)
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1))
          const swap = pool[i]
          pool[i] = pool[j]
          pool[j] = swap
        }
        for (const p of pool.slice(0, conf.count)) {
          const period = between(conf.period[0], conf.period[1])
          const radius = between(conf.min, conf.max)
          const direction = random() * Math.PI * 2
          p.jitter = {
            '--jx': (Math.cos(direction) * radius).toFixed(3) + 'px',
            '--jy': (Math.sin(direction) * radius).toFixed(3) + 'px',
            '--dshcps-tj': period.toFixed(3) + 's',
            // 随机落进周期里的任意位置，不让 14 颗一起起跳
            '--dshcps-delay-j': (-random() * period).toFixed(3) + 's',
          }
        }
      }
      for (const particle of out) {
        particle.style.left = particle.left.toFixed(3) + '%'
        particle.style.top = particle.top.toFixed(3) + '%'
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
          { className: 'dshcps-particle-x' },
          h(
            'span',
            { className: 'dshcps-particle-y' },
            particle.jitter
              ? h('span', { className: 'dshcps-particle-j is-jittering', style: particle.jitter }, star)
              : star,
          ),
        ),
      )
    }

    /** 最高档：滑动的紫蓝材质 + 呼吸柔光 + 24 颗浮尘，粒子跟着材质一起从右往左铺开。 */
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
      const [view, setView] = React.useState('dial')
      const [dragIndex, setDragIndex] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [hovered, setHovered] = React.useState(null)
      const [pos, setPos] = React.useState(null)
      // 额度提醒：只要**停在**最高档就显示 1.6s，然后淡回模型名
      const [showQuota, setShowQuota] = React.useState(false)
      // 每次重新点亮都自增，用来把 1.6s 计时重新起算
      const [quotaTick, setQuotaTick] = React.useState(0)
      // 拖柄溅射：非 0 时挂载墨点环并播放一次，播完（或离开最高档）归 0
      const [burstKey, setBurstKey] = React.useState(0)

      const anchorRef = React.useRef(null)
      const popRef = React.useRef(null)
      const trackRef = React.useRef(null)

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

      /* ---------- 额度提醒：停在最高档就显示，1.6s 后淡回模型名 ----------
         用 isUltra（含拖动预览）而不是提交态：**拖到那一档的瞬间就亮**，不用等松手，
         也不用等 selectModel 的 RPC 往返。离开最高档立刻收起并清掉定时器。 */
      const flashQuota = React.useCallback(() => setQuotaTick((n) => n + 1), [])

      React.useEffect(() => {
        if (!isUltra) {
          setShowQuota(false)
          return
        }
        setShowQuota(true)
        setQuotaTick((n) => n + 1)
      }, [isUltra])

      React.useEffect(() => {
        if (!showQuota) return undefined
        const timer = setTimeout(() => setShowQuota(false), 1600)
        return () => clearTimeout(timer)
      }, [showQuota, quotaTick])

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
        const width = pop.offsetWidth || CARD_W
        const height = pop.offsetHeight || 200
        const left = clamp(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, window.innerWidth - width - 8))
        let top = rect.top - 12 - height
        if (top < 8) top = Math.min(window.innerHeight - height - 8, rect.bottom + 12)
        setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
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
          setView('dial')
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (view === 'models') {
            setView('dial')
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
          setView('dial')
          setHovered(null)
          commit({ provider: nextEntry.provider, model: nextEntry.model.id, reasoningEffort: nextEffort })
        },
        [activeEffortId, commit],
      )

      const resetEffort = React.useCallback(() => {
        if (!current || !defaultEffortId) return
        setDragIndex(null)
        commit({ provider: current.provider, model: current.model, reasoningEffort: defaultEffortId })
      }, [current, defaultEffortId, commit])

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
        // 点/拖到最高档那一下立刻点亮（哪怕本来就停在最高档，也重新计一次时）
        if (total >= 3 && next === total - 1) flashQuota()
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
      const chipLabel = text ? text.short : '选择推理强度'

      const chip = h(
        'button',
        {
          ref: anchorRef,
          type: 'button',
          className: 'dshcps-chip' + (open ? ' is-open' : ''),
          disabled: !canOpen && !open,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          title: text ? text.full + ' · ' + (model ? model.name : '') : '选择推理强度',
          onClick: () => {
            setOpen((value) => !value)
            setView('dial')
          },
        },
        h('span', { className: 'dshcps-chip-dot' + (isUltra ? ' is-ultra' : '') }),
        h('span', null, chipLabel),
        h(ChevronIcon, { size: 11 }),
      )

      let card = null
      if (open) {
        const openModels = () => setView(view === 'models' ? 'dial' : 'models')
        const head = h(
          'div',
          { className: 'dshcps-head' },
          h('div', { className: 'dshcps-title' + (isUltra ? ' is-ultra' : '') }, text ? text.short : '推理强度'),
          // 第二行：额度提醒与模型名叠在同一个格子里交叉淡化。
          // 只有「切入最高档」后的 1.6s 显示提醒，之后回来后者的可点入口。
          h(
            'div',
            { className: 'dshcps-subwrap', 'data-notice': showQuota ? 'true' : 'false' },
            h('span', { className: 'dshcps-quota', 'aria-hidden': 'true' }, QUOTA_HINT),
            h(
              'button',
              {
                type: 'button',
                className: 'dshcps-sub',
                disabled: showQuota,
                tabIndex: showQuota ? -1 : 0,
                'aria-hidden': showQuota ? 'true' : undefined,
                'aria-label': '选择模型，当前模型：' + (model ? model.name : '未选择'),
                onClick: openModels,
              },
              h('span', null, model ? model.name : '选择模型'),
              h(ChevronIcon, { size: 10 }),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dshcps-reset',
              disabled: !canUse || busy || !defaultEffortId || activeEffortId === defaultEffortId,
              title: '恢复该模型的默认推理强度',
              'aria-label': '恢复默认',
              onClick: resetEffort,
            },
            h(ResetIcon, {}),
          ),
        )

        let body
        if (view === 'models') {
          const groups = (catalog && catalog.groups) || []
          body = h(
            'div',
            null,
            h('div', { className: 'dshcps-panel-title' }, '选择模型'),
            groups.length === 0
              ? h('div', { className: 'dshcps-empty' }, '模型目录加载中…')
              : groups.map((group, groupIndex) =>
                  h(
                    'div',
                    { className: 'dshcps-group', key: group.id },
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
                          className:
                            'dshcps-row' +
                            (current && current.provider === group.id && current.model === item.id ? ' is-active' : ''),
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
        } else {
          body = h(
            'div',
            null,
            h(
              'div',
              {
                ref: trackRef,
                className:
                  'dshcps-track' + (dragIndex !== null ? ' is-dragging' : '') + (canUse ? '' : ' is-locked'),
                role: 'slider',
                tabIndex: canUse ? 0 : -1,
                'aria-label': '推理强度',
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
            ),
            total === 0
              ? h(
                  'div',
                  { className: 'dshcps-note' },
                  locked ? '推理强度不可调整' : '当前模型未公布推理强度：在 profile 的 reasoningEfforts 里配置后即可调节',
                )
              : null,
          )
        }

        card = ReactDOM.createPortal(
          h(
            'div',
            {
              ref: popRef,
              className: 'dshcps-pop',
              role: 'dialog',
              'aria-label': '推理强度',
              style: pos ? { left: pos.left + 'px', top: pos.top + 'px' } : { left: '-9999px', top: '0px' },
            },
            head,
            body,
            error ? h('div', { className: 'dshcps-error' }, error) : null,
          ),
          document.body,
        )

        if (hovered && hovered.text) {
          card = h(
            React.Fragment,
            null,
            card,
            ReactDOM.createPortal(
              h('div', { className: 'dshcps-tip', style: tipStyle }, hovered.text),
              document.body,
            ),
          )
        }
      }

      return h('div', { className: 'dshcps-root' }, chip, card)
    }

    /* ======================================================================
     * 六、插件挂载
     * ==================================================================== */
    function apply(ctx) {
      const Bound = (props) => h(PowerSlider, Object.assign({}, props, { __ctx: ctx }))
      Bound.displayName = 'CodexPowerSlider'

      try {
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register(
            { name: SLOT, id: PLUGIN_ID, order: 40 },
            Bound,
          ),
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
