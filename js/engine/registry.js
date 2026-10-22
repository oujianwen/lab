/* ============================================================
   组件注册表 —— ComponentTypes / Categories / 校验 / 注册 / 注销
   ------------------------------------------------------------
   本模块是整个“开放组件系统”的中心枢纽（Single Source of Truth）：
     - ComponentTypes：全局组件定义字典（type → def），渲染/交互/面板/序列化都读它
     - Categories   ：组件分类元数据（机械/光学/其它），用于组件库分组展示
     - validateComponentDef：外部组件的契约校验，保证最低可用性
     - registerComponent / unregisterComponent：组件的注册与注销（含持久化联动）
   组件定义(def)契约（内置与外部统一遵循）：
     必需：type/label/defaults/getPosition/setPosition/getRadius/render(含 render.main)
     可选：icon/category/color/properties/getHandles/onHandleDrag/hitTest/onTap/
           onPlace/scale/onPropertyChange/system(含 update) 等钩子
   依赖：与 loop.js/scenes.js/plugins.js 存在双向引用——本文件把这些 import
   写在末尾，仅“运行时”才调用，靠 ES module live binding 保证求值期安全。
   ============================================================ */
import { renderPanel, renderSceneTabs } from './loop.js';   // 仅运行时调用，无求值期依赖

/* 全局组件定义字典：键为组件 type，值为该组件的完整定义对象。
   内置组件由 builtin.js 直接赋值注册；外部组件经 registerComponent 注册。
   以空对象字面量导出，依赖其引用不变、内容持续增删（live 单例） */
export const ComponentTypes = {};

/* 组件分类元数据：决定组件库面板中的分组标题与图标。
   category 不在下列键内的外部组件，注册时会被归入 other（见 registerComponent 兜底） */
export const Categories = {
    mechanical: { label: '机械', icon: '⚙️' },
    optical:    { label: '光学', icon: '💧' },
    other:      { label: '其他', icon: '📦' }
};

/* 按分类筛选组件：供组件库面板分组渲染。
   返回 [{type, ...def}] 数组，把 type 一并附进对象方便按钮直接取用 */
export function getComponentsByCategory(cat) {
    return Object.entries(ComponentTypes)
        .filter(([k, v]) => v.category === cat)
        .map(([type, def]) => ({ type, ...def }));
}

/* ---------- 组件契约校验 ----------
   在注册前对 def 做“最低可用性”检查，不合规即抛错（由上层 loadComponentFromCode
   捕获并向用户提示）。这样能挡住结构残缺、字段类型错误的外部件，
   避免运行期渲染/交互管线取到 undefined 而崩溃。
   校验项：
     1) 必需字段存在性（type/label/defaults/getPosition/setPosition/getRadius/render）
     2) type 命名规范：字母开头 + 字母数字下划线（作对象键与 data-type 用，需安全）
     3) 关键字段类型：defaults/render.main/几何三函数必须是函数
     4) properties 若提供则必须是数组 */
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

/* ---------- 组件注册 ----------
   把一个已校验的 def 纳入 ComponentTypes，并处理内置/外部的冲突与覆盖策略：
     - 与同名内置组件冲突（非 __external）→ 直接拒绝，保护内置件不被顶替
     - 与同名外部组件冲突 → 未指定 overwrite 时 confirm 询问用户；同意则先注销旧的
     注册时补充元信息并做兜底归一：
       __external=true（标记为外部件，参与持久化）
       __code/__source（缓存源码文本与来源名，供 localStorage 恢复）
       category 非法或缺失时归入 other；properties 缺省补空数组
   若 def 附带物理系统（system.update），注册到 Systems 表（键加 __plugin_ 前缀，
   使主循环每帧自动调度该插件的 update）
   最后写回 localStorage 完成持久化 */
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

/* ---------- 组件注销 ----------
   仅允许移除外部件（内置件无 __external，直接返回，保护核心组件）。
   清理步骤：
     1) 从 ComponentTypes 删除定义
     2) 移除其可能注册的物理系统（__plugin_ 前缀键）
     3) 遍历所有场景，剔除该类型的已放置部件（组件没了，实例也无法再渲染）
     4) 若当前选中项因此失效则清空选中（clearSelectionIfInvalid）
     5) 持久化同步 + 刷新面板与标签栏
   silent=true 时不弹提示（供 registerComponent 覆盖旧件时内部调用，避免多余提示） */
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

/* 跨模块引用：运行时才用到，ES module live binding 保证安全。
   刻意放在文件末尾，配合上方注释可看出本模块与被引模块存在双向依赖，
   但因均为运行时调用，不参与模块求值期，故不会触发循环依赖的 TDZ 问题 */
import { Systems } from '../components/systems.js';
import { Scenes, getCurrentScene } from './scenes.js';
import { clearSelectionIfInvalid, showTip } from './loop.js';
import { savePluginsToStorage } from './plugins.js';