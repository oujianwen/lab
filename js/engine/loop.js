/* ============================================================
   渲染 / 交互 / 主循环 / 事件 / 启动辅助
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

/* 供 registry/plugins/scenes 统一从 loop 取用的符号再导出一次 */
export { renderPanel };
export { renderSceneTabs };
export { showTip };

/* ---------- 通用工具 ---------- */
export function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/* ---------- 交互状态（本模块独占写入，外部用 setter） ---------- */
export let selectedId = null;
let dragging = null;
let draggingHandle = null;
let dragStart = null;
let activePointer = null;
export let placingType = null;

export function setSelectedId(v) { selectedId = v; }
export function setDragging(v) { dragging = v; }
export function setDraggingHandle(v) { draggingHandle = v; }
export function setPlacingType(v) { placingType = v; }
export function clearSelectionIfInvalid() {
    if (!selectedId) return;
    const cur = getCurrentScene();
    if (cur && !cur.elements.find(e => e.id === selectedId)) selectedId = null;
}

/* ============================================================
   渲染
   ============================================================ */
export function buildEnv(scene) {
    return { ctx, W, H, S, MODULE: 8.5 * S, time, scene, selectedId, lastDt: loop._lastDt || 0.016 };
}
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
function drawLightRays(scene, env) {
    if (!scene.showRays) return;
    const c = env.ctx;
    const eyes = scene.elements.filter(e => e.type === 'eye');
    if (!eyes.length) return;
    const eye = eyes[0];
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
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
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
function hitHandle(scene, el, p, env) {
    if (!el) return null;
    const def = ComponentTypes[el.type];
    if (!def || !def.getHandles) return null;
    const handles = def.getHandles(el, env);
    for (const h of handles) if (dist(p, h) < 14 * env.S) return { el, handle: h };
    return null;
}
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
/* 拖拽时同步属性面板坐标输入框（由 panel.js 提供实现） */
import { syncPositionInputs } from './panel.js';

/* ============================================================
   尺寸 / 启动
   ============================================================ */
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