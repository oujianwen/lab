/* ============================================================
   插件系统 —— 代码解析 / 注册 / localStorage 持久化 / 自动加载
   ------------------------------------------------------------
   本模块让平台以“外部 JS 片段”的形式扩展新组件，承担四条职责：
     1) loadComponentFromCode：把一段代码文本解析成组件定义对象并注册
     2) loadAutoComponents   ：启动时读 manifest.json，批量自动加载 js/components/*.js
     3) savePluginsToStorage ：把外部组件源码持久化到 localStorage
     4) loadPersistedPlugins ：页面重开时从 localStorage 恢复历史组件
   安全提示（重要，见代码评审）：解析采用 new Function 执行任意代码，
   且会从 localStorage/拖拽文件/粘贴文本加载——对“在线分享平台”是主要
   风险点，未来应改为沙箱(iframe/Worker)执行或声明式 schema。
   依赖：与 registry.js/loop.js 双向引用，靠 ES module live binding 在运行时调用。
   ============================================================ */
import { validateComponentDef, registerComponent, ComponentTypes } from './registry.js';
import { renderPanel, renderSceneTabs } from './loop.js';
import { showTip } from '../core/toast.js';
import { Scenes } from './scenes.js';

/* localStorage 存储键：带版本号 _v1，便于日后数据结构升级时区分/迁移 */
export const PLUGIN_STORAGE_KEY = 'physlab_plugins_v1';
/* 第一方组件目录：manifest.json 与各部件 .js 均在此（需 HTTP 服务访问，file:// 下 fetch 会失败） */
export const COMPONENTS_DIR = 'js/components';

/* ---------- 单组件加载 ----------
   把一段代码文本解析为组件定义对象并注册。采用两级解析回退策略，兼容两种写法：
     ① 先尝试把整段代码当作“对象字面量/函数表达式”求值：return (${code})
        —— 适配本项目组件的标准写法：整体是一个 IIFE，结尾为 })()（无分号），
           其求值结果即组件定义对象；若结果是函数(def 为 function)则再调用一次拿对象。
     ② 若①抛错，则退而当作“语句脚本”执行，取其中名为 component 的变量作为定义。
   解析成功后：validateComponentDef 校验必需字段 → registerComponent 注册（含持久化）
   → 刷新面板与标签栏。opts.silent 抑制成功提示（批量自动加载时用）；
     opts.overwrite 决定同名外部组件是否直接覆盖（自动加载带覆盖，用户导入需 confirm）。 */
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

/* ---------- 启动自动加载 ----------
   读取 COMPONENTS_DIR/manifest.json 得到文件名数组，再逐个 fetch 其源码并
   以 { silent:true, overwrite:true } 加载——静默且强制覆盖，确保：
     - 不逐个弹提示（避免启动时刷屏）
     - 用随应用分发的“文件最新版”覆盖上一步 loadPersistedPlugins 从
       localStorage 恢复的“旧版”，实现单一数据源以文件为准。
   容错：manifest 读不到时（典型为以 file:// 打开）打印警告并整体跳过，
   提示改用 HTTP 服务器访问；单个部件加载失败仅记录、不中断其余加载。
   最后统一刷新一次 UI，并按成功/失败数量给出汇总提示。 */
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

/* ---------- 持久化写入 ----------
   遍历注册表，挑选带 __external 标记且缓存了源码(__code)的外部组件，
   序列化为 [{type, code, source}] 写入 localStorage。
   仅存外部组件（内置组件随代码分发无需持久化）。
   写入 try/catch 兜底：隐私模式/配额超限等场景静默失败，不影响主功能。
   （由 registerComponent/unregisterComponent 在增删时自动调用） */
export function savePluginsToStorage() {
    const list = [];
    for (const type in ComponentTypes) {
        const def = ComponentTypes[type];
        if (def.__external && def.__code) list.push({ type, code: def.__code, source: def.__source });
    }
    try { localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}

/* ---------- 持久化恢复 ----------
   启动早期（在 loadAutoComponents 之前）从 localStorage 读回历史外部组件并逐个加载，
   使刷新页面后用户此前导入的组件仍可用。
   每个组件独立 try/catch：个别损坏/不兼容不会阻断其余组件恢复。
   注意：这里恢复的“旧版”随后会被 loadAutoComponents 以文件最新版静默覆盖。
   整体再包一层 try/catch，兜住 JSON 解析失败（数据损坏）等异常。 */
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