/* ============================================================
   插件系统：代码解析 / 注册 / localStorage 持久化 / 自动加载
   ============================================================ */
import { validateComponentDef, registerComponent, ComponentTypes } from './registry.js';
import { renderPanel, renderSceneTabs } from './loop.js';
import { showTip } from '../core/toast.js';
import { Scenes } from './scenes.js';

export const PLUGIN_STORAGE_KEY = 'physlab_plugins_v1';
export const COMPONENTS_DIR = 'js/components';

export function loadComponentFromCode(code, sourceName, opts) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('代码为空');
    let def;
    try {
        const factory = new Function(`"use strict"; return (${code});`);
        def = factory();
        if (typeof def === 'function') def = def();
    } catch (e1) {
        try {
            const factory = new Function(`"use strict";\n${code}\n;return typeof component !== 'undefined' ? component : undefined;`);
            def = factory();
        } catch (e2) {
            throw new Error('解析失败：' + e2.message);
        }
    }
    if (!def || typeof def !== 'object') throw new Error('文件没有返回有效的组件定义');
    validateComponentDef(def);
    registerComponent(def, code, sourceName, opts);
    renderPanel();
    renderSceneTabs();
    if (!(opts && opts.silent)) showTip(`已加载组件「${def.label}」`);
    return def;
}

/* 启动时自动加载 js/components/*.js */
export async function loadAutoComponents() {
    let files;
    try {
        const res = await fetch(`${COMPONENTS_DIR}/manifest.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        files = await res.json();
    } catch (e) {
        console.warn(`[自动加载] 跳过：无法读取 ${COMPONENTS_DIR}/manifest.json（${e.message}）。若以 file:// 打开本页，请改用 HTTP 服务器访问。`);
        return;
    }
    if (!Array.isArray(files)) return;
    let ok = 0; const failed = [];
    for (const name of files) {
        try {
            const res = await fetch(`${COMPONENTS_DIR}/${name}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const code = await res.text();
            loadComponentFromCode(code, name, { silent: true, overwrite: true });
            ok++;
        } catch (err) {
            failed.push(name);
            console.warn('[自动加载] 部件加载失败:', name, err);
        }
    }
    renderPanel();
    renderSceneTabs();
    if (ok) showTip(`已自动加载 ${ok} 个组件${failed.length ? `，${failed.length} 个失败：${failed.join('、')}` : ''}`);
    else if (failed.length) showTip('组件自动加载失败：' + failed.join('、'), true);
}

export function savePluginsToStorage() {
    const list = [];
    for (const type in ComponentTypes) {
        const def = ComponentTypes[type];
        if (def.__external && def.__code) list.push({ type, code: def.__code, source: def.__source });
    }
    try { localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}

export function loadPersistedPlugins() {
    try {
        const raw = localStorage.getItem(PLUGIN_STORAGE_KEY);
        if (!raw) return;
        for (const item of JSON.parse(raw)) {
            try { loadComponentFromCode(item.code, item.source); }
            catch (e) { console.warn('插件恢复失败：', item.type, e.message); }
        }
    } catch (e) {}
}