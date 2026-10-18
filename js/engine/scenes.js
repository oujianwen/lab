/* ============================================================
   场景管理 + 预置场景 + 场景切换
   ============================================================ */
import { uid, W, H, S } from '../core/state.js';
import { ComponentTypes } from './registry.js';
import { canvas, sceneTabsEl } from '../core/dom.js';
import { showTip } from '../core/toast.js';
import { escapeHtml } from './loop.js';
import { renderPanel, setSelectedId, setDragging, setDraggingHandle, setPlacingType } from './loop.js';

export const Scenes = [];
export let currentSceneId = null;
export function setCurrentSceneId(id) { currentSceneId = id; }

export function createScene(opts) {
    opts = opts || {};
    return {
        id: uid('scene'),
        name: opts.name || '新实验',
        icon: opts.icon || '🔬',
        elements: opts.elements || [],
        background: opts.background || 'dark',
        showRays: false,
        time: 0
    };
}
export function getCurrentScene() { return Scenes.find(s => s.id === currentSceneId) || null; }

export function addElement(scene, type, x, y) {
    const def = ComponentTypes[type];
    if (!def) return null;
    const el = def.defaults();
    el.id = uid(type);
    el.type = type;
    if (x != null && y != null) {
        if (el.x != null) { el.x = x; el.y = y; }
        else if (el.x1 != null) {
            const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
            const dx = x - cx, dy = y - cy;
            el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy;
        }
        else if (def.onPlace) def.onPlace(el, x, y, { W, H, S: 1, scene });
    }
    if (type === 'top') el.startTime = scene.time;
    scene.elements.push(el);
    return el;
}

/* ---------- 预置场景 ---------- */
export function createGearScene() {
    const scene = createScene({ name: '齿轮转啊转', icon: '⚙️' });
    const g1 = addElement(scene, 'gear', W * 0.3, H * 0.4);
    Object.assign(g1, { teeth: 12, color: '#5eb3ff', isDriver: true, speed: 0.9, draggable: false });
    const g2 = addElement(scene, 'gear', W * 0.3 + 130, H * 0.75);
    Object.assign(g2, { teeth: 20, color: '#7fdd6e' });
    const g3 = addElement(scene, 'gear', W * 0.65, H * 0.75);
    Object.assign(g3, { teeth: 16, color: '#ffb055' });
    return scene;
}
export function createRefractionScene() {
    const scene = createScene({ name: '光的折射', icon: '💧' });
    const cupW = 160, cupH = 240;
    const cup = addElement(scene, 'cup', W * 0.3 - cupW / 2, H * 0.85 - cupH);
    cup.w = cupW; cup.h = cupH; cup.waterLevel = 0.65; cup.refraction = 1.33;
    const stick = addElement(scene, 'stick', 0, 0);
    Object.assign(stick, {
        x1: cup.x + cup.w * 0.28, y1: cup.y - 50,
        x2: cup.x + cup.w * 0.72, y2: cup.y + cup.h - 10
    });
    addElement(scene, 'eye', cup.x - 90, cup.y - 100);
    const cup2 = addElement(scene, 'cup', W * 0.7 - cupW / 2, H * 0.85 - cupH);
    cup2.w = cupW; cup2.h = cupH; cup2.waterLevel = 0.65; cup2.refraction = 1.33;
    const coin = addElement(scene, 'coin', cup2.x + cup2.w / 2, cup2.y + cup2.h - 22);
    coin.r = 22;
    addElement(scene, 'eye', cup2.x - 90, cup2.y - 100);
    return scene;
}
export function createTopScene() {
    const scene = createScene({ name: '陀螺转啊转', icon: '🌀' });
    const baseY = H * 0.78;
    const size = 0.62;
    const t1 = addElement(scene, 'top', W * 0.18, baseY);
    Object.assign(t1, { size, comFrac: 0.72, tipType: 'sharp', massDist: 'uniform', color: '#5A7AA8', startTime: 0 });
    const t2 = addElement(scene, 'top', W * 0.36, baseY);
    Object.assign(t2, { size, comFrac: 0.30, tipType: 'sharp', massDist: 'uniform', color: '#4A9E78', startTime: 0 });
    const t3 = addElement(scene, 'top', W * 0.58, baseY);
    Object.assign(t3, { size, comFrac: 0.50, tipType: 'flat', massDist: 'uniform', color: '#B07432', startTime: 0 });
    const t4 = addElement(scene, 'top', W * 0.76, baseY);
    Object.assign(t4, { size, comFrac: 0.50, tipType: 'sharp', massDist: 'uniform', color: '#A86FAE', startTime: 0 });
    return scene;
}

/* ---------- 场景切换 ---------- */
export function renderSceneTabs() {
    sceneTabsEl.innerHTML = Scenes.map(s => `
    <button class="scene-tab${s.id === currentSceneId ? ' active' : ''}" data-id="${s.id}">
      <span>${s.icon}</span>
      <span class="tab-name">${escapeHtml(s.name)}</span>
      ${Scenes.length > 1 ? '<span class="tab-close" data-close="1">×</span>' : ''}
    </button>
  `).join('');
    sceneTabsEl.querySelectorAll('.scene-tab').forEach(tab => {
        tab.onclick = e => {
            if (e.target.classList.contains('tab-close')) {
                const id = tab.dataset.id;
                const s = Scenes.find(x => x.id === id);
                if (!s) return;
                if (!confirm(`删除实验「${s.name}」？`)) return;
                const idx = Scenes.indexOf(s);
                Scenes.splice(idx, 1);
                if (currentSceneId === id) switchToScene(Scenes[Math.max(0, idx - 1)].id);
                else renderSceneTabs();
                return;
            }
            switchToScene(tab.dataset.id);
        };
    });
}
export function switchToScene(id) {
    if (!Scenes.find(s => s.id === id)) return;
    currentSceneId = id;
    setSelectedId(null);
    setDragging(null);
    setDraggingHandle(null);
    setPlacingType(null);
    canvas.style.cursor = 'default';
    renderSceneTabs();
    renderPanel();
}
export function createNewScene() {
    const name = prompt('给这个新实验起个名字：', '我的实验');
    if (name === null) return;
    const scene = createScene({ name: name.trim() || '未命名实验', icon: '🧪' });
    Scenes.push(scene);
    switchToScene(scene.id);
    showTip('新实验已创建，从组件库添加部件吧');
}

/* ---------- 龟兔赛跑（依赖外部部件，需在部件加载完成后调用） ---------- */
export function createRaceScene() {
    const scene = createScene({ name: '龟兔赛跑', icon: '🏁' });
    const trackY = H * 0.66;
    const trk = addElement(scene, 'race_track', W * 0.5, trackY);
    if (trk) { trk.started = false; trk.lanes = 2; trk.shape = 'bend'; }
    addElement(scene, 'turtle', W * 0.2, trackY);
    addElement(scene, 'rabbit', W * 0.2, trackY - 52 * S);
    return scene;
}
export function initRaceScene() {
    if (!ComponentTypes.race_track || !ComponentTypes.turtle || !ComponentTypes.rabbit) {
        console.warn('[龟兔赛跑] 部件未就绪，跳过（请确认 manifest 已加载 race_track/turtle/rabbit）');
        return;
    }
    if (Scenes.some(s => s.name === '龟兔赛跑')) return;
    const s = createRaceScene();
    Scenes.push(s);
    switchToScene(s.id);
    showTip('已加载「龟兔赛跑」实验');
}
