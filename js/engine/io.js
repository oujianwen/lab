/* ============================================================
   序列化 / 反序列化 / 导入导出数据中枢
   ------------------------------------------------------------
   职责：在「内存中的场景/部件对象」与「可存储、可分享的 JSON」之间双向转换。
   分为四层：
     1) 元素级：serializeElement / deserializeElement
     2) 场景级：serializeScene / deserializeScene
     3) 工作区级 + 多格式分发：importData（兼容历史遗留格式）
     4) 文件下载：downloadJSON
   依赖说明：与 loop.js 存在双向引用，靠 ES module live binding 在运行时才调用，
   规避模块求值期的循环依赖问题。
   ============================================================ */
import { uid, S } from '../core/state.js';
import { ComponentTypes } from './registry.js';
import { createScene, Scenes, switchToScene, getCurrentScene } from './scenes.js';
import { showTip } from '../core/toast.js';
import { setSelectedId, renderPanel } from './loop.js';

/* ---------- 元素级：序列化 ---------- */

/* 将单个部件净化为可导出的纯数据。
   - JSON 深拷贝：顺带剔除函数/undefined 等不可序列化内容
   - 删除 id：导入时重新生成，避免 id 冲突
   - 删除 __missing：运行时“组件缺失”占位标记，非用户配置
   - 删除 _xxx 下划线字段：均为物理模拟的瞬时状态（角速度、倾角、进度等），
     不属于用户的实验配置，导出前应清除以保证文件干净、可复现
   注意：此处瞬态字段为逐个硬编码删除，新增组件若引入 _ 前缀运行态需同步登记 */
export function serializeElement(el) {
    const copy = JSON.parse(JSON.stringify(el));
    delete copy.id; delete copy.__missing;
    delete copy._omega; delete copy._meshParent;
    delete copy._spinPhase; delete copy._vel; delete copy._tilt; delete copy._fallProgress; delete copy._tau;
    return copy;
}

/* 将场景打包为可导出对象。
   requiredComponents：用 Set 去重收集本场景用到的所有组件类型，
   相当于给场景打上“依赖清单”，导入方据此可提前发现缺失的插件 */
export function serializeScene(scene) {
    return {
        name: scene.name, icon: scene.icon, background: scene.background,
        showRays: scene.showRays,
        elements: scene.elements.map(serializeElement),
        requiredComponents: Array.from(new Set(scene.elements.map(e => e.type)))
    };
}

/* ---------- 元素级：反序列化 ---------- */

/* 由原始 JSON 还原单个部件。
   ① 类型未注册（插件未装）→ 保留原始数据并打 __missing 标记，交由渲染层显示“缺失”占位，不崩溃
   ② 已注册 → Object.assign(defaults(), raw)：存档只覆盖用户实际配置字段，
      未写明的字段自动取当前版本默认值，天然支持向后兼容
   ③ 重新分配 id（uid）
   ④ 特判陀螺 top：重置 startTime 与全部物理量，使导入后处于静止待转初始态 */
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

/* 由原始 JSON 还原整个场景。
   逐个还原元素后统计缺失类型；若有缺失，延迟 80ms 弹 Toast 提示——
   延迟是为避开同步渲染流程、确保 UI 就绪后再提示 */
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

/* ---------- 工作区级 + 多格式智能分发 ---------- */

/* 导入入口：按数据形态（type 字段及结构特征）路由到对应处理分支，
   同时兼容平台早期版本导出的遗留格式。各分支“导入即生效”（直接改全局 Scenes 并切换）。 */
export function importData(data) {
    if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象');
    const t = data.type;

    // 【工作区】多场景：替换当前全部场景；已有场景时先 confirm 防误覆盖
    if (t === 'workspace' && Array.isArray(data.scenes)) {
        if (!data.scenes.length) throw new Error('工作区里没有实验');
        if (Scenes.length && !confirm(`导入 ${data.scenes.length} 个实验，替换当前所有？`)) return;
        Scenes.length = 0;
        for (const raw of data.scenes) Scenes.push(deserializeScene(raw));
        switchToScene(Scenes[0].id);
        showTip(`已导入 ${Scenes.length} 个实验`);
        return;
    }

    // 【单场景】标准格式：还原后追加并切换
    if (t === 'scene' && data.scene) {
        const s = deserializeScene(data.scene);
        Scenes.push(s); switchToScene(s.id);
        showTip(`已导入实验「${s.name}」`);
        return;
    }

    // 【单部件】放入当前场景：缺失组件直接拒绝；成功则偏移 24px 防重叠并选中
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

    // 【遗留格式】早期齿轮场景导出：无驱动齿轮时把第一个设为驱动
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

    // 【遗留格式】早期折射场景导出
    if (t === 'refraction-scene' || Array.isArray(data.elements)) {
        const scene = createScene({ name: '导入的折射场景', icon: '💧' });
        const arr = Array.isArray(data.elements) ? data.elements : [data];
        for (const raw of arr) { const el = deserializeElement(raw); if (el) scene.elements.push(el); }
        Scenes.push(scene); switchToScene(scene.id);
        showTip('已导入折射场景');
        return;
    }

    // 【遗留格式】早期单部件导出
    if (t === 'refraction-element' && data.element) {
        const el = deserializeElement(data.element);
        if (!el) throw new Error('无法识别的部件');
        const scene = getCurrentScene();
        if (!scene) throw new Error('请先选择一个实验');
        scene.elements.push(el); setSelectedId(el.id); renderPanel();
        showTip('已导入部件');
        return;
    }

    // 所有已知形态均不匹配
    throw new Error('无法识别格式');
}

/* ---------- 文件下载 ---------- */

/* 在浏览器端触发 JSON 文件下载。
   - JSON.stringify(obj, null, 2)：缩进 2 格，便于人读/手改
   - 用 Blob + createObjectURL 生成临时 URL，挂隐藏 <a> 点击触发下载
   - 关键：revokeObjectURL 需延迟执行——不能立即释放，否则下载尚未启动 URL 就失效 */
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