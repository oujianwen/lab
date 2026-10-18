/* ============================================================
   组件注册表：ComponentTypes / Categories / 校验 / 注册 / 注销
   ============================================================ */
import { renderPanel, renderSceneTabs } from './loop.js';   // 仅运行时调用，无求值期依赖

export const ComponentTypes = {};

export const Categories = {
    mechanical: { label: '机械', icon: '⚙️' },
    optical:    { label: '光学', icon: '💧' },
    other:      { label: '其他', icon: '📦' }
};

export function getComponentsByCategory(cat) {
    return Object.entries(ComponentTypes)
        .filter(([k, v]) => v.category === cat)
        .map(([type, def]) => ({ type, ...def }));
}

export function validateComponentDef(def) {
    const required = ['type', 'label', 'defaults', 'getPosition', 'setPosition', 'getRadius', 'render'];
    for (const k of required) {
        if (def[k] == null) throw new Error(`缺少必需字段：${k}`);
    }
    if (typeof def.type !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(def.type)) {
        throw new Error('type 必须是字母开头的标识符（如 spring、myFan）');
    }
    if (typeof def.defaults !== 'function') throw new Error('defaults 必须是函数');
    if (typeof def.render !== 'object' || typeof def.render.main !== 'function') {
        throw new Error('render.main 必须是函数');
    }
    for (const k of ['getPosition', 'setPosition', 'getRadius']) {
        if (typeof def[k] !== 'function') throw new Error(`${k} 必须是函数`);
    }
    if (def.properties && !Array.isArray(def.properties)) {
        throw new Error('properties 必须是数组');
    }
}

export function registerComponent(def, code, sourceName, opts) {
    opts = opts || {};
    if (ComponentTypes[def.type] && !ComponentTypes[def.type].__external) {
        throw new Error(`组件标识 "${def.type}" 与内置组件冲突`);
    }
    if (ComponentTypes[def.type] && ComponentTypes[def.type].__external) {
        if (!opts.overwrite && !confirm(`已存在外部组件 "${def.type}"，覆盖吗？`)) throw new Error('用户取消覆盖');
        unregisterComponent(def.type, true);
    }
    def.__external = true;
    def.__code = code;
    def.__source = sourceName || 'imported';
    if (!def.category || !Categories[def.category]) def.category = 'other';
    if (!def.properties) def.properties = [];
    ComponentTypes[def.type] = def;
    if (def.system && typeof def.system.update === 'function') {
        Systems['__plugin_' + def.type] = def.system;
    }
    savePluginsToStorage();
}

export function unregisterComponent(type, silent) {
    const def = ComponentTypes[type];
    if (!def || !def.__external) return;
    delete ComponentTypes[type];
    delete Systems['__plugin_' + type];
    for (const scene of Scenes) {
        scene.elements = scene.elements.filter(e => e.type !== type);
    }
    clearSelectionIfInvalid();
    savePluginsToStorage();
    renderPanel();
    renderSceneTabs();
    if (!silent) showTip(`已移除组件「${def.label}」`);
}

/* 跨模块引用：运行时才用到，ES module live binding 保证安全 */
import { Systems } from '../components/systems.js';
import { Scenes, getCurrentScene } from './scenes.js';
import { clearSelectionIfInvalid, showTip } from './loop.js';
import { savePluginsToStorage } from './plugins.js';