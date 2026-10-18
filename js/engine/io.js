/* ============================================================
   序列化 / 反序列化 / 导入导出数据
   ============================================================ */
import { uid, S } from '../core/state.js';
import { ComponentTypes } from './registry.js';
import { createScene, Scenes, switchToScene, getCurrentScene } from './scenes.js';
import { showTip } from '../core/toast.js';
import { setSelectedId, renderPanel } from './loop.js';

export function serializeElement(el) {
    const copy = JSON.parse(JSON.stringify(el));
    delete copy.id; delete copy.__missing;
    delete copy._omega; delete copy._meshParent;
    delete copy._spinPhase; delete copy._vel; delete copy._tilt; delete copy._fallProgress; delete copy._tau;
    return copy;
}
export function serializeScene(scene) {
    return {
        name: scene.name, icon: scene.icon, background: scene.background,
        showRays: scene.showRays,
        elements: scene.elements.map(serializeElement),
        requiredComponents: Array.from(new Set(scene.elements.map(e => e.type)))
    };
}
export function deserializeElement(raw) {
    if (!raw || !raw.type) return null;
    const def = ComponentTypes[raw.type];
    if (!def) { const o = Object.assign({}, raw); o.id = uid(raw.type); o.__missing = true; return o; }
    const el = Object.assign(def.defaults(), raw);
    el.id = uid(raw.type);
    if (raw.type === 'top') {
        el.startTime = null; el._spinPhase = 0; el._vel = 1; el._tilt = 0; el._fallProgress = 0; el._tau = 0;
    }
    return el;
}
export function deserializeScene(raw) {
    const scene = createScene({
        name: raw.name || '导入的试验',
        icon: raw.icon || '🔬',
        background: raw.background || 'dark'
    });
    scene.showRays = !!raw.showRays;
    const arr = Array.isArray(raw.elements) ? raw.elements : [];
    for (const r of arr) { const el = deserializeElement(r); if (el) scene.elements.push(el); }
    const missing = new Set();
    for (const el of scene.elements) if (el.__missing) missing.add(el.type);
    if (missing.size) {
        setTimeout(() => showTip(`缺少 ${missing.size} 个组件插件：${Array.from(missing).join(', ')}`, true), 80);
    }
    return scene;
}

export function importData(data) {
    if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象');
    const t = data.type;
    if (t === 'workspace' && Array.isArray(data.scenes)) {
        if (!data.scenes.length) throw new Error('工作区里没有实验');
        if (Scenes.length && !confirm(`导入 ${data.scenes.length} 个实验，替换当前所有？`)) return;
        Scenes.length = 0;
        for (const raw of data.scenes) Scenes.push(deserializeScene(raw));
        switchToScene(Scenes[0].id);
        showTip(`已导入 ${Scenes.length} 个实验`);
        return;
    }
    if (t === 'scene' && data.scene) {
        const s = deserializeScene(data.scene);
        Scenes.push(s); switchToScene(s.id);
        showTip(`已导入实验「${s.name}」`);
        return;
    }
    if (t === 'component' && data.component) {
        const el = deserializeElement(data.component);
        if (!el) throw new Error('无法识别的部件');
        if (el.__missing) throw new Error(`组件类型「${el.type}」未安装，请先导入对应插件`);
        const scene = getCurrentScene();
        if (!scene) throw new Error('请先选择一个实验');
        const pos = ComponentTypes[el.type].getPosition(el);
        ComponentTypes[el.type].setPosition(el, pos.x + 24 * S, pos.y + 24 * S);
        if (el.type === 'top') el.startTime = scene.time;
        scene.elements.push(el);
        setSelectedId(el.id);
        renderPanel();
        showTip(`已导入 ${ComponentTypes[el.type].label}`);
        return;
    }
    if (t === 'gears-scene' || Array.isArray(data.gears) || data.teeth != null) {
        const scene = createScene({ name: '导入的齿轮场景', icon: '⚙️' });
        let list = [];
        if (Array.isArray(data.gears)) list = data.gears;
        else if (t === 'gear' && data.gear) list = [data.gear];
        else if (data.teeth != null) list = [data];
        for (const raw of list) {
            const el = deserializeElement({ type: 'gear', ...raw });
            if (el) scene.elements.push(el);
        }
        if (!scene.elements.some(e => e.isDriver) && scene.elements.length) scene.elements[0].isDriver = true;
        Scenes.push(scene); switchToScene(scene.id);
        showTip('已导入齿轮场景');
        return;
    }
    if (t === 'refraction-scene' || Array.isArray(data.elements)) {
        const scene = createScene({ name: '导入的折射场景', icon: '💧' });
        const arr = Array.isArray(data.elements) ? data.elements : [data];
        for (const raw of arr) { const el = deserializeElement(raw); if (el) scene.elements.push(el); }
        Scenes.push(scene); switchToScene(scene.id);
        showTip('已导入折射场景');
        return;
    }
    if (t === 'refraction-element' && data.element) {
        const el = deserializeElement(data.element);
        if (!el) throw new Error('无法识别的部件');
        const scene = getCurrentScene();
        if (!scene) throw new Error('请先选择一个实验');
        scene.elements.push(el); setSelectedId(el.id); renderPanel();
        showTip('已导入部件');
        return;
    }
    throw new Error('无法识别格式');
}

export function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}