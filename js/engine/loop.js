/* ============================================================
   渲染 / 交互 / 主循环 / 事件 / 启动辅助 —— 引擎心脏
   ------------------------------------------------------------
   本模块把「Canvas 即时模式渲染」「指针与键盘交互」「requestAnimationFrame
   主循环」「物理系统调度」「尺寸自适应」串成一条完整流水线，是运行时驱动者。
   同时它也充当「符号再导出中心」：registry/plugins/scenes/panel 需要的
   renderPanel、renderSceneTabs、showTip 等都从这里统一转出，
   并与这些模块形成双向 import（靠 ES module live binding 在运行时才调用，
   从而规避模块求值期的循环依赖）。
   ============================================================ */
import { canvas, ctx, stage, panel, hudEl } from '../core/dom.js';
import { W, H, S, DPR, time, setViewport, advanceTime, uid } from '../core/state.js';
import { clamp, dist, distToSegment, roundRectPath } from '../core/math.js';
import { showTip } from '../core/toast.js';
import { Audio } from '../core/audio.js';
import { ComponentTypes } from './registry.js';
import { Systems } from '../components/systems.js';
import {
    Scenes, getCurrentScene, createScene, addElement,
    createGearScene, createRefractionScene, createTopScene,
    switchToScene, setCurrentSceneId, renderSceneTabs
} from './scenes.js';
import { renderPanel } from './panel.js';
import { loadComponentFromCode } from './plugins.js';

/* 供 registry/plugins/scenes 统一从 loop 取用的符号再导出一次（中转，避免各处重复引入） */
export { renderPanel };
export { renderSceneTabs };
export { showTip };

/* ---------- 通用工具 ---------- */

/* HTML 转义：把 & < > " ' 替换为实体，防止用户输入（场景名/组件名等）
   经 innerHTML 注入面板或标签页时造成 XSS。凡拼接进 HTML 字符串的用户数据都应过此函数 */
export function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/* ============================================================
   交互状态（本模块独占写入，外部只能通过 setter 修改）
   ------------------------------------------------------------
   用模块级私有变量集中管理“选中/拖拽/放置”等瞬时交互态，
   对外只暴露 setSelectedId 等写入口，防止外部随意篡改造成状态错乱 */
/* ============================================================ */
export let selectedId = null;      // 当前选中部件 id（null 表示无选中）
let dragging = null;               // 正在被拖动的部件对象
let draggingHandle = null;         // 正在被拖动的控制点（如木棍端点、跑道路径点）
let dragStart = { };               // 拖拽起始快照：记录按下时指针位置与部件原位置，用于算位移
let activePointer = null;          // 当前活动指针 id：保证多指触控下只处理一个指针
export let placingType = null;     // 待放置的组件类型（点库按钮后进入“点击画布即放置”模式）

export function setSelectedId(v) { selectedId = v; }
export function setDragging(v) { dragging = v; }
export function setDraggingHandle(v) { draggingHandle = v; }
export function setPlacingType(v) { placingType = v; }
/* 选中项可能因场景切换或删除而失效：校验 id 是否仍存在于当前场景，不存在则清空选中 */
export function clearSelectionIfInvalid() {
    if (!selectedId) return;
    const cur = getCurrentScene();
    if (cur && !cur.elements.find(e => e.id === selectedId)) selectedId = null;
}

/* ============================================================
   渲染
   ============================================================ */

/* 构造“环境上下文”env：每次渲染/交互都把它传给组件的绘制与命中钩子，
   集中提供画布句柄、尺寸、缩放、模块基准值、时间、场景与选中态等，
   使组件函数保持无状态（数据都从参数取），便于插件沙箱化。
   MODULE=8.5*S 是齿轮“模数”（齿的大小基准）等共享尺度。
   lastDt 从主循环挂在 loop._lastDt 上的上一帧时长取用（供依赖步长的系统/组件读取） */
export function buildEnv(scene) {
    return { ctx, W, H, S, MODULE: 8.5 * S, time, scene, selectedId, lastDt: loop._lastDt || 0.016 };
}

/* 绘制场景背景：竖向渐变天空 + 底部地面暖色渐变 + 淡网格线。
   scene.background==='dark' 用深蓝紫配色，否则用更深的近黑配色；
   网格步长随缩放 S 自适应 */
function drawBackground(scene, env) {
    const c = env.ctx;
    const g = c.createLinearGradient(0, 0, 0, H);
    if (scene.background === 'dark') {
        g.addColorStop(0, '#1a2438'); g.addColorStop(0.55, '#0d1422'); g.addColorStop(1, '#050810');
    } else {
        g.addColorStop(0, '#10142a'); g.addColorStop(1, '#080a16');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const ty = H * 0.85;
    const tg = c.createLinearGradient(0, ty, 0, H);
    tg.addColorStop(0, 'rgba(74, 48, 32, 0.35)');
    tg.addColorStop(1, 'rgba(21, 12, 5, 0)');
    c.fillStyle = tg;
    c.fillRect(0, ty, W, H - ty);
    c.strokeStyle = 'rgba(120, 160, 240, 0.03)';
    c.lineWidth = 1;
    const step = 60 * S;
    for (let x = 0; x < W; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}

/* 绘制光路（折射演示专用）。仅当 scene.showRays 为真时执行。
   说明：这是“引擎直接内置特定组件逻辑”的典型例子——它硬编码认识了
   eye/coin/cup/stick 等类型；理想做法是下沉为组件自身的 overlay 钩子
   （见代码评审建议）。
   逻辑：取场景里第一个眼睛作为观察点，对“浸在水下的硬币/木棍”计算其
   因折射产生的视觉偏移点，再从该点向眼睛画一条折断的入射/折射光线 */
function drawLightRays(scene, env) {
    if (!scene.showRays) return;
    const c = env.ctx;
    const eyes = scene.elements.filter(e => e.type === 'eye');
    if (!eyes.length) return;
    const eye = eyes[0];
    // 单条光线绘制：from 物点 → 水面命中点 hitX → to 眼睛；命中点画高亮小圆
    const drawRay = (fromX, fromY, toEyeX, toEyeY, waterY, cup) => {
        const hitX = clamp((fromX + toEyeX) / 2, cup.x + 6 * env.S, cup.x + cup.w - 6 * env.S);
        c.save();
        c.strokeStyle = 'rgba(255, 213, 79, 0.75)';
        c.lineWidth = 1.5 * env.S;
        c.beginPath(); c.moveTo(fromX, fromY); c.lineTo(hitX, waterY); c.stroke();
        c.beginPath(); c.moveTo(hitX, waterY); c.lineTo(toEyeX, toEyeY); c.stroke();
        c.beginPath(); c.arc(hitX, waterY, 3.5 * env.S, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,213,79,1)'; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.2 * env.S; c.stroke();
        c.restore();
    };
    // 硬币：找到包含它的杯子，若硬币位于水面之下则画光线
    for (const coin of scene.elements.filter(e => e.type === 'coin')) {
        let cup = null;
        for (const o of scene.elements) {
            if (o.type === 'cup' && coin.x >= o.x && coin.x <= o.x + o.w && coin.y >= o.y && coin.y <= o.y + o.h) { cup = o; break; }
        }
        if (!cup || cup.waterLevel <= 0.01) continue;
        const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
        if (coin.y <= waterY) continue;
        drawRay(coin.x, coin.y, eye.x, eye.y, waterY, cup);
    }
    // 木棍：找浸入水下的部分，取水下段中点作为物点画光线
    for (const s of scene.elements.filter(e => e.type === 'stick')) {
        let cup = null;
        for (const o of scene.elements) {
            if (o.type !== 'cup' || o.waterLevel < 0.01) continue;
            const waterY = o.y + o.h * (1 - o.waterLevel * 0.92);
            if (Math.max(s.y1, s.y2) <= waterY) continue;
            const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
            if (xMax < o.x || xMin > o.x + o.w) continue;
            cup = o; break;
        }
        if (!cup) continue;
        const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
        const dy = s.y2 - s.y1;
        if (Math.abs(dy) < 0.001) continue;
        const tWater = clamp((waterY - s.y1) / dy, 0, 1);
        if (tWater >= 1) continue;
        const midT = (tWater + 1) / 2;
        const px = s.x1 + (s.x2 - s.x1) * midT;
        const py = s.y1 + (s.y2 - s.y1) * midT;
        drawRay(px, py, eye.x, eye.y, waterY, cup);
    }
}

/* 绘制选中态：围绕当前选中部件画一圈流动的虚线高亮，并渲染可拖拽控制点。
   同样按部件类型（stick/cup/top/其它圆形）分别确定高亮轮廓形状；
   lineDashOffset 随时间变化形成“蚂蚁线”动画效果 */
function drawSelection(scene, env) {
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) return;
    const def = ComponentTypes[el.type];
    if (!def) return;
    const c = env.ctx;
    c.save();
    c.strokeStyle = 'rgba(94, 179, 255, 0.9)';
    c.lineWidth = 2 * env.S;
    c.setLineDash([6 * env.S, 4 * env.S]);
    c.lineDashOffset = -env.time * 25;
    if (el.type === 'stick') {
        c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke();
    } else if (el.type === 'cup') {
        c.strokeRect(el.x - 6 * env.S, el.y - 6 * env.S, el.w + 12 * env.S, el.h + 12 * env.S);
    } else if (el.type === 'top') {
        const w = 200 * env.S * (el.size || 1);
        const h = 310 * env.S * (el.size || 1);
        c.strokeRect(el.x - w / 2, el.y - h, w, h);
    } else {
        const r = def.getRadius(el, env) + 8 * env.S;
        const pos = def.getPosition(el);
        c.beginPath(); c.arc(pos.x, pos.y, r, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    // 控制点：由组件 getHandles 提供，绘制为蓝底白边实心圆，供端点拖拽
    const handles = def.getHandles ? def.getHandles(el, env) : [];
    if (handles.length) {
        c.save();
        c.fillStyle = '#5eb3ff'; c.strokeStyle = '#fff'; c.lineWidth = 2 * env.S;
        for (const h of handles) {
            c.beginPath(); c.arc(h.x, h.y, 7 * env.S, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        c.restore();
    }
}

/* 画布左上角的操作引导文字：根据“有无部件/是否选中”给出不同提示语，
   带半透明圆角底衬保证可读性 */
function drawStatusText(scene, env) {
    const c = env.ctx;
    const count = scene.elements.length;
    let text;
    if (!count) text = '点击上方组件库添加部件';
    else if (selectedId) text = '拖动移动 · 面板编辑属性';
    else text = `${count} 个部件 · 点击选择`;
    c.save();
    c.font = `bold ${13 * S}px system-ui, sans-serif`;
    const tw = c.measureText(text).width;
    const padX = 14 * S, bh = 30 * S, bw = tw + padX * 2;
    const bx = 16 * S, by = 16 * S;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    roundRectPath(c, bx, by, bw, bh, bh / 2);
    c.fill();
    c.fillStyle = '#cfe0f7';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, bx + padX, by + bh / 2 + 1);
    c.restore();
}

/* 缺失组件的占位绘制：画一个红色虚线方框，中间标注“缺失”与类型名，
   让导入场景即使缺少插件也不会崩溃或空白 */
function drawMissingPlaceholder(el, env) {
    const c = env.ctx;
    const x = el.x ?? el.x1 ?? 0;
    const y = el.y ?? el.y1 ?? 0;
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,110,130,.15)';
    c.strokeStyle = 'rgba(255,110,130,.7)';
    c.lineWidth = 2 * env.S;
    c.setLineDash([6 * env.S, 4 * env.S]);
    c.beginPath(); c.rect(-40 * env.S, -40 * env.S, 80 * env.S, 80 * env.S); c.fill(); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,180,190,.9)';
    c.font = `bold ${12 * env.S}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('缺失', 0, -8 * env.S);
    c.font = `${10 * env.S}px system-ui, sans-serif`;
    c.fillText(el.type, 0, 10 * env.S);
    c.restore();
}

/* 场景渲染主流程（每帧调用一次）：
   1) 无场景则清屏填充纯色后返回
   2) 依次绘制 背景 → 光路 → 各部件 → 选中框 → 状态文字
   3) 部件按 back/main/front 三相位分轮绘制（两轮之间可形成遮挡，如杯壁遮水） */
export function renderScene(scene) {
    if (!scene) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H); return; }
    const env = buildEnv(scene);
    ctx.clearRect(0, 0, W, H);
    drawBackground(scene, env);
    drawLightRays(scene, env);
    const phases = ['back', 'main', 'front'];
    for (const phase of phases) {
        for (const el of scene.elements) {
            if (el.__missing) { if (phase === 'main') drawMissingPlaceholder(el, env); continue; }
            const def = ComponentTypes[el.type];
            if (def && def.render && def.render[phase]) def.render[phase](el, scene, env);
        }
    }
    drawSelection(scene, env);
    drawStatusText(scene, env);
}

/* ============================================================
   交互
   ============================================================ */

/* 将指针事件的客户端坐标换算为画布内逻辑坐标（减去画布在页面中的偏移） */
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* 命中检测：从数组末尾（最上层，后画者在上）往前遍历，
   优先命中之前的部件。组件有自定义 hitTest 用之，否则退化为“距中心 < 半径”圆形判定 */
function hitTest(scene, p, env) {
    for (let i = scene.elements.length - 1; i >= 0; i--) {
        const el = scene.elements[i];
        if (el.__missing) continue;
        const def = ComponentTypes[el.type];
        if (!def) continue;
        if (def.hitTest) { if (def.hitTest(el, p, env)) return el; }
        else { if (dist(p, def.getPosition(el)) < def.getRadius(el, env)) return el; }
    }
    return null;
}

/* 控制点命中检测：仅对当前选中部件，判断指针是否落在其某个 handle 上（阈值 14*S） */
function hitHandle(scene, el, p, env) {
    if (!el) return null;
    const def = ComponentTypes[el.type];
    if (!def || !def.getHandles) return null;
    const handles = def.getHandles(el, env);
    for (const h of handles) if (dist(p, h) < 14 * env.S) return { el, handle: h };
    return null;
}

/* 指针按下：
   - 先初始化 Audio（浏览器要求音频须在用户手势中启动）
   - activePointer 门闩：已有活动指针则忽略（防多指冲突）
   - 若处于 placingType 放置模式：在点击处新建部件、选中、退出放置并播音效
   - 否则优先检测是否点中“选中部件的控制点”→ 进入控制点拖拽
   - 再否则做部件命中：命中则选中并记录拖拽起点、播抓取音；点空白则清空选中 */
function onPointerDown(e) {
    Audio.init();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    const scene = getCurrentScene();
    if (!scene) return;
    const p = getPos(e);
    const env = buildEnv(scene);
    if (placingType) {
        const el = addElement(scene, placingType, p.x, p.y);
        if (el) {
            selectedId = el.id;
            placingType = null;
            canvas.style.cursor = 'default';
            Audio.add();
            renderPanel();
            showTip(`已添加 ${ComponentTypes[el.type].label}`);
        }
        return;
    }
    if (selectedId) {
        const sel = scene.elements.find(x => x.id === selectedId);
        if (sel) {
            const hh = hitHandle(scene, sel, p, env);
            if (hh) { draggingHandle = hh.handle; dragging = sel; return; }
        }
    }
    const hit = hitTest(scene, p, env);
    if (hit) {
        selectedId = hit.id;
        dragging = hit;
        const def = ComponentTypes[hit.type];
        const pos = def.getPosition(hit);
        dragStart = { startX: p.x, startY: p.y, origX: pos.x, origY: pos.y };
        Audio.grab();
        renderPanel();
    } else {
        selectedId = null;
        dragging = null;
        renderPanel();
    }
}

/* 指针移动：仅处理活动指针且处于拖拽中。
   - 若拖的是控制点：交由组件 onHandleDrag 处理（改形状/端点）
   - 若拖的是部件本体：以“按下起点 + 位移”算新位置调 setPosition
   - 两者都在移动后同步面板坐标输入框（避免整块面板重绘丢焦点） */
function onPointerMove(e) {
    if (activePointer !== e.pointerId || !dragging) return;
    const p = getPos(e);
    const scene = getCurrentScene();
    if (!scene) return;
    const def = ComponentTypes[dragging.type];
    const env = buildEnv(scene);
    if (draggingHandle) {
        if (def.onHandleDrag) def.onHandleDrag(dragging, draggingHandle.id, p, env);
        syncPositionInputs();
        return;
    }
    const dx = p.x - dragStart.startX;
    const dy = p.y - dragStart.startY;
    def.setPosition(dragging, dragStart.origX + dx, dragStart.origY + dy);
    syncPositionInputs();
}

/* 指针抬起：释放活动指针门闩。
   - 若按下与抬起位移极小(<6px)且非控制点拖拽，视为“点击(tap)”→ 调组件 onTap（如触发话筒/开始比赛）
   - 收尾：播放放下音，清空所有拖拽临时状态 */
function onPointerUp(e) {
    if (activePointer !== e.pointerId) return;
    activePointer = null;
    if (dragging && !draggingHandle && dragStart) {
        const p = getPos(e);
        if (Math.hypot(p.x - dragStart.startX, p.y - dragStart.startY) < 6) {
            const scene = getCurrentScene();
            const def = ComponentTypes[dragging.type];
            if (scene && def && def.onTap) def.onTap(dragging, scene, buildEnv(scene));
        }
    }
    if (dragging) Audio.drop();
    dragging = null;
    draggingHandle = null;
    dragStart = null;
}
/* 拖拽时同步属性面板坐标输入框（由 panel.js 提供实现，避免整块 renderPanel 重绘导致输入框丢焦） */
import { syncPositionInputs } from './panel.js';

/* ============================================================
   尺寸 / 启动
   ============================================================ */

/* 画布尺寸自适应（窗口/容器变化、面板折叠时调用）：
   1) 依据 stage 容器实际大小设 canvas 物理像素(×DPR)与 CSS 尺寸，并重设 transform 以 DPR 缩放
   2) DPR 上限 2，兼顾清晰与性能；S 缩放系数按高度比例 clamp 在 [0.55,1.15]
   3) 尺寸变化时对所有场景所有部件做坐标按比例缩放（x/y/端点/w/h/r），
      并调用组件自定义 scale 钩子处理特殊字段（如跑道路径点），保证内容不错位 */
export function resize() {
    const rect = stage.getBoundingClientRect();
    const oldW = W, oldH = H;
    const nW = Math.max(240, rect.width);
    const nH = Math.max(240, rect.height);
    const nDPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(nW * nDPR);
    canvas.height = Math.round(nH * nDPR);
    canvas.style.width = nW + 'px';
    canvas.style.height = nH + 'px';
    ctx.setTransform(nDPR, 0, 0, nDPR, 0, 0);
    const nS = clamp(nH / 800, 0.55, 1.15);
    setViewport(nW, nH, nS, nDPR);
    if (oldW > 0 && oldH > 0 && (oldW !== nW || oldH !== nH)) {
        const sx = nW / oldW, sy = nH / oldH;
        for (const scene of Scenes) {
            for (const el of scene.elements) {
                if (el.x != null) { el.x *= sx; el.y *= sy; }
                if (el.x1 != null) { el.x1 *= sx; el.y1 *= sy; el.x2 *= sx; el.y2 *= sy; }
                if (el.w != null) { el.w *= sx; el.h *= sy; }
                if (el.r != null) { el.r *= sx; }
                const def = ComponentTypes[el.type];
                if (def && def.scale) def.scale(el, sx, sy);
            }
        }
    }
}

/* 初始化三个预置示例场景（齿轮/折射/陀螺），重置为默认工作区，
   选中第一个场景并刷新标签栏与面板 */
export function initDefaultScenes() {
    Scenes.length = 0;
    Scenes.push(createGearScene());
    Scenes.push(createRefractionScene());
    Scenes.push(createTopScene());
    setCurrentSceneId(Scenes[0].id);
    selectedId = null;
    renderSceneTabs();
    renderPanel();
}

/* ============================================================
   主循环
   ============================================================ */

/* requestAnimationFrame 驱动的每帧总入口：
   1) 计算 dt（秒），并 clamp 单帧上限 50ms：防止切后台再回来时产生巨大跳变（“追帧”）
   2) 把 dt 挂在 loop._lastDt 供 buildEnv / 依赖步长的组件读取；推进全局 time
   3) 遍历所有 Systems 执行物理更新（先物理后渲染，保证同帧数据一致）
   4) 更新 HUD 文本，再整帧渲染场景
   5) 递归申请下一帧 —— 形成连续循环 */
let lastT = 0;
export function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(t - lastT, 50) / 1000;
    lastT = t;
    loop._lastDt = dt;
    advanceTime(dt);
    const scene = getCurrentScene();
    if (scene) {
        scene.time += dt;
        const env = buildEnv(scene);
        for (const sysKey in Systems) {
            if (Systems[sysKey].update) Systems[sysKey].update(scene, dt, env);
        }
        updateHUD(scene);
    } else {
        updateHUD(null);
    }
    renderScene(scene);
    requestAnimationFrame(loop);
}

/* 更新画布叠加的 HUD 信息层：目前专用于陀螺——为每个正在旋转的陀螺
   显示重心/轴尖/质量分布参数与实时转速、时长或“已倒下”状态。无陀螺则清空 */
function updateHUD(scene) {
    if (!scene) { hudEl.innerHTML = ''; return; }
    const tops = scene.elements.filter(e => e.type === 'top' && e.startTime != null);
    if (!tops.length) { hudEl.innerHTML = ''; return; }
    hudEl.innerHTML = tops.map((el, i) => {
        const tau = el._tau || 0;
        const done = (el._fallProgress || 0) > 0.85;
        const tip = { sharp: '尖', round: '圆', flat: '平' }[el.tipType] || '';
        const mass = { center: '中', uniform: '匀', edge: '边' }[el.massDist] || '';
        const status = done ? '💤 已倒下' : `${(el._vel || 1).toFixed(2)}x · ${tau.toFixed(1)}s`;
        return `<div class="hud-item">陀螺${i + 1}｜重心${Math.round(el.comFrac * 100)}% 轴${tip} 质量${mass}｜${status}</div>`;
    }).join('');
}

/* ============================================================
   事件
   ============================================================ */
import { deleteSelected, duplicateSelected } from './panel.js';
import { createNewScene } from './scenes.js';

/* 一次性绑定所有全局事件监听（在启动流程 bindEvents 阶段调用）：
   - 指针事件：canvas 上按下，move/up/cancel 挂到 window（保证拖出画布也能正确结束）
   - 顶栏按钮：新建实验、面板折叠/展开（折叠后需重新 resize 适配新画布宽度）
   - 窗口 resize + ResizeObserver：双重保证容器尺寸变化时画布跟随
   - 键盘：Delete/Backspace 删除、Esc 取消放置/选中、Ctrl/⌘+D 复制；
     输入控件聚焦时不拦截（避免误删正在输入的内容）
   - 拖拽导入：向画布拖入 .js 文件即加载为组件（场景仍走 .json） */
export function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', e => e.preventDefault());
    document.getElementById('btnNewScene').onclick = createNewScene;
    document.getElementById('panelToggle').onclick = () => {
        panel.classList.toggle('collapsed');
        document.getElementById('panelToggle').textContent = panel.classList.contains('collapsed') ? '»' : '«';
        requestAnimationFrame(resize);
    };
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(stage);
    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
        if (e.key === 'Escape') { placingType = null; canvas.style.cursor = 'default'; selectedId = null; renderPanel(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    });
    // 拖拽 .js 文件直接导入组件
    stage.addEventListener('dragover', e => e.preventDefault());
    stage.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!/\.js$/i.test(file.name)) {
            showTip('只支持 .js 组件文件（场景仍用 .json）', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try { loadComponentFromCode(String(reader.result), file.name); }
            catch (err) { showTip('加载失败：' + err.message, true); }
        };
        reader.readAsText(file);
    });
}