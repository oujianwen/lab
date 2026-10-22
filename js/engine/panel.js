/* ============================================================
   右侧面板 UI —— 渲染 / 各区块 build & bind / 部件操作
   ------------------------------------------------------------
   本模块负责右侧“控制台”面板的全部逻辑，采用统一的「build + bind」两段式模式：
     - build*()  : 返回该区块的 HTML 字符串（写入 panelBody.innerHTML）
     - bind*()   : 在 HTML 注入后为该区块的控件绑定事件处理器
   renderPanel() 按固定顺序拼装八大区块：
     当前实验 → 组件库 → 组件插件 → 场景部件列表 → 属性编辑 → 显示 → 导入导出
   设计意图：面板是“数据驱动”的视图层——每次交互后视需要调用 renderPanel
   全量重绘；而拖拽等高频场景改调 syncPositionInputs 局部更新，避免重绘丢焦点。
   依赖：与 loop.js 双向引用（selectedId/placingType 等状态从这里读取，
   renderPanel 又被 loop 再导出），靠 ES module live binding 保证运行时取到实时值。
   ============================================================ */
import { panelBody, canvas } from '../core/dom.js';
import { S, uid } from '../core/state.js';
import { toHex6 } from '../core/math.js';
import { showTip } from '../core/toast.js';
import { Audio } from '../core/audio.js';
import { ComponentTypes, Categories, getComponentsByCategory, unregisterComponent } from './registry.js';
import { Scenes, getCurrentScene, switchToScene, renderSceneTabs } from './scenes.js';
import { escapeHtml, selectedId, placingType, setSelectedId, setPlacingType, initDefaultScenes } from './loop.js';
import { downloadJSON, importData, serializeElement, serializeScene } from './io.js';
import { loadComponentFromCode } from './plugins.js';   // 供“导入组件/从代码加载”功能使用

/* ---------- 面板总渲染入口 ----------
   取当前场景；无场景则显示引导空态，有场景则拼装全部区块 HTML 后
   依次执行对应的 bind 函数完成事件挂载（build 与 bind 分离，确保
   DOM 已存在后再查询绑定，逻辑清晰、便于各区块独立演进） */
export function renderPanel() {
    const scene = getCurrentScene();
    if (!scene) {
        panelBody.innerHTML = '<div class="empty-hint">请从顶部新建或选择一个实验</div>';
        return;
    }
    panelBody.innerHTML = `
    ${buildSceneSection(scene)}
    ${buildLibrarySection(scene)}
    ${buildPluginSection()}
    ${buildElementListSection(scene)}
    ${buildPropertySection(scene)}
    ${buildDisplaySection(scene)}
    ${buildIOSection(scene)}
  `;
    bindSceneSection(scene);
    bindLibrarySection(scene);
    bindPluginSection();
    bindElementListSection(scene);
    bindPropertySection(scene);
    bindDisplaySection(scene);
    bindIOSection(scene);
}

/* ========== 区块一：当前实验 ========== */
/* build：实验名输入框 + 清空部件 / 删除实验 按钮 */
function buildSceneSection(scene) {
    return `<div class="section">
    <div class="section-title"><span>当前实验</span></div>
    <label class="field"><span>名称</span>
      <input type="text" id="sceneName" value="${escapeHtml(scene.name)}">
    </label>
    <div class="btn-row">
      <button class="btn" id="btnClearScene">🧹 清空部件</button>
      <button class="btn danger" id="btnDeleteScene">🗑 删除实验</button>
    </div>
  </div>`;
}
/* bind：改名实时同步到场景并刷新顶部标签；清空/删除前 confirm 防误操作。
   删除时至少保留一个实验；删除后切换到相邻场景 */
function bindSceneSection(scene) {
    const nameInput = document.getElementById('sceneName');
    if (nameInput) nameInput.oninput = () => { scene.name = nameInput.value; renderSceneTabs(); };
    const clearBtn = document.getElementById('btnClearScene');
    if (clearBtn) clearBtn.onclick = () => {
        if (!scene.elements.length) return;
        if (!confirm('清空当前场景的所有部件？')) return;
        scene.elements = []; setSelectedId(null); Audio.click(); renderPanel();
    };
    const delBtn = document.getElementById('btnDeleteScene');
    if (delBtn) delBtn.onclick = () => {
        if (Scenes.length <= 1) { showTip('至少保留一个实验', true); return; }
        if (!confirm(`删除实验「${scene.name}」？`)) return;
        const idx = Scenes.indexOf(scene);
        Scenes.splice(idx, 1);
        switchToScene(Scenes[Math.max(0, idx - 1)].id);
        showTip('已删除实验');
    };
}

/* ========== 区块二：组件库 ========== */
/* build：按分类（机械/光学/其它）网格展示所有可添加组件；
   若处于放置模式（placingType），标题处高亮提示“点击画布放置 xx”。
   c 来自 getComponentsByCategory，type 存于 data-type 供 bind 读取 */
function buildLibrarySection(scene) {
    let html = `<div class="section">
    <div class="section-title">
      <span>组件库</span>
      ${placingType ? `<span class="badge">点击画布放置 ${ComponentTypes[placingType].label}</span>` : ''}
    </div>`;
    for (const catKey in Categories) {
        const cat = Categories[catKey];
        const comps = getComponentsByCategory(catKey);
        if (!comps.length) continue;
        html += `<div class="cat-title">${cat.icon} ${cat.label}</div>`;
        html += `<div class="comp-grid">`;
        for (const c of comps) {
            html += `<button class="comp-btn${placingType === c.type ? ' active' : ''}" data-type="${c.type}">
        <span class="ico">${c.icon || '📦'}</span><span>${c.label}</span>
      </button>`;
        }
        html += `</div>`;
    }
    html += `</div>`;
    return html;
}
/* bind：点击组件按钮进入/退出“放置模式”（再次点同一按钮取消）。
   切换 canvas 光标为十字准星提示可放置，随后全量重绘面板以更新高亮态 */
function bindLibrarySection(scene) {
    panelBody.querySelectorAll('.comp-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            setPlacingType(placingType === type ? null : type);
            Audio.click();
            canvas.style.cursor = placingType ? 'crosshair' : 'default';
            renderPanel();
        };
    });
}

/* ========== 区块三：组件插件管理 ========== */
/* build：列出所有已加载的外部组件（__external 标记），提供移除按钮；
   并给出“导入 .js 文件”与“粘贴代码加载”两种插件添加途径。
   注：label/type 等用户可控字段经 escapeHtml 防注入 */
function buildPluginSection() {
    const external = Object.values(ComponentTypes).filter(d => d.__external);
    return `<div class="section">
    <div class="section-title">
      <span>组件插件</span>
      <span class="badge">${external.length} 个已加载</span>
    </div>
    ${external.length ? external.map(d => `
      <div class="plugin-item">
        <span>${d.icon || '📦'} ${escapeHtml(d.label)}
          <span class="muted" style="font-size:10.5px;">（${d.type}）</span>
        </span>
        <button class="btn danger" data-unload="${d.type}">移除</button>
      </div>
    `).join('') : '<div class="muted" style="margin-bottom:8px;">还没有导入外部组件</div>'}
    <label class="btn full file">📦 导入组件文件（.js）
      <input type="file" id="componentFile" accept=".js">
    </label>
    <textarea class="io-text" id="componentCode"
              placeholder="或粘贴组件代码（对象字面量 / 函数）"></textarea>
    <button class="btn full" id="btnLoadComponent">从代码加载组件</button>
  </div>`;
}
/* bind：移除组件（unregisterComponent 会级联删除场景内该类型部件）；
   文件选择用 FileReader 读文本后 loadComponentFromCode 加载；
   粘贴方式直接取 textarea 内容加载。加载后清空输入框，读 input 后重置 value 以便重复选同一文件 */
function bindPluginSection() {
    const q = s => panelBody.querySelector(s);
    panelBody.querySelectorAll('[data-unload]').forEach(btn => {
        btn.onclick = () => {
            const t = btn.dataset.unload;
            const d = ComponentTypes[t];
            if (!d) return;
            if (!confirm(`移除组件「${d.label}」？场景中已放置的该组件也会一并删除。`)) return;
            unregisterComponent(t);
        };
    });
    const fileInput = q('#componentFile');
    if (fileInput) fileInput.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { loadComponentFromCode(String(reader.result), file.name); }
            catch (err) { showTip('加载失败：' + err.message, true); }
        };
        reader.onerror = () => showTip('文件读取失败', true);
        reader.readAsText(file);
        e.target.value = '';
    };
    const loadBtn = q('#btnLoadComponent');
    if (loadBtn) loadBtn.onclick = () => {
        const code = q('#componentCode').value;
        if (!code.trim()) { showTip('请先粘贴组件代码', true); return; }
        try { loadComponentFromCode(code, 'pasted'); q('#componentCode').value = ''; }
        catch (err) { showTip('加载失败：' + err.message, true); }
    };
}

/* ========== 区块四：场景部件列表 ========== */
/* build：以“胶囊 chip”罗列当前场景所有部件，前置色点标识类型色；
   选中项加 active 高亮；杯子额外显示水位百分比；
   data-eid 存部件 id 供点击选中。def 缺失（未知类型）时以 ?type 兜底显示 */
function buildElementListSection(scene) {
    if (!scene.elements.length) {
        return `<div class="section">
      <div class="section-title"><span>场景部件</span></div>
      <div class="empty-hint">还没有部件<br>从上方组件库添加</div>
    </div>`;
    }
    let html = `<div class="section">
    <div class="section-title"><span>场景部件</span><span class="badge">${scene.elements.length}</span></div>
    <div class="chips">`;
    for (const el of scene.elements) {
        const def = ComponentTypes[el.type];
        const isSel = el.id === selectedId;
        const color = el.color || (def && def.color) || '#888';
        const label = def ? def.label : `?${el.type}`;
        const icon = def ? (def.icon || '📦') : '❓';
        let extra = '';
        if (el.type === 'cup') extra = ` ${Math.round(el.waterLevel * 100)}%`;
        html += `<button class="chip${isSel ? ' active' : ''}" data-eid="${el.id}">
      <span class="dot" style="background:${color}"></span>${icon} ${escapeHtml(label)}${extra}
    </button>`;
    }
    html += `</div></div>`;
    return html;
}
/* bind：点击 chip 选中对应部件并重绘面板（从而刷新属性编辑区） */
function bindElementListSection(scene) {
    panelBody.querySelectorAll('.chip[data-eid]').forEach(chip => {
        chip.onclick = () => {
            setSelectedId(chip.dataset.eid);
            Audio.click();
            renderPanel();
        };
    });
}

/* ========== 区块五：属性编辑（面板最核心区块） ========== */
/* build：根据选中部件的 def.properties 声明式生成表单控件。
   - 无选中 → 空态引导
   - 缺失部件 → 仅提示 + 删除按钮
   - 正常部件 → 遍历 properties 逐字段渲染；陀螺额外附“重新旋转”按钮；底部通用复制/删除
   控件类型由 buildPropertyField 按 prop.type 分派，实现“组件定义即 UI” */
function buildPropertySection(scene) {
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) {
        return `<div class="section">
      <div class="section-title"><span>属性</span></div>
      <div class="empty-hint">点击画布或上方列表选中部件</div>
    </div>`;
    }
    if (el.__missing) {
        return `<div class="section">
      <div class="section-title"><span>属性</span><span class="badge">缺失</span></div>
      <div class="muted">该组件类型「${escapeHtml(el.type)}」未安装，请先导入对应插件。</div>
      <button class="btn danger full" style="margin-top:8px;" id="btnDeleteEl">🗑 删除</button>
    </div>`;
    }
    const def = ComponentTypes[el.type];
    if (!def) return '';
    let html = `<div class="section">
    <div class="section-title">
      <span>属性</span>
      <span class="badge ${def.category}">${def.icon || '📦'} ${def.label}</span>
    </div>`;
    for (const prop of def.properties || []) {
        html += buildPropertyField(prop, el[prop.key]);
    }
    if (el.type === 'top') {
        html += `<button class="btn full" id="btnRestartTop" style="margin-top:6px;">↻ 重新开始旋转</button>`;
    }
    html += `<div class="btn-row">
    <button class="btn" id="btnDuplicate">⧉ 复制</button>
    <button class="btn danger" id="btnDeleteEl">🗑 删除</button>
  </div></div>`;
    return html;
}
/* build 辅助：把单个属性声明渲染为对应控件。支持 5 种类型：
   - number：数字输入；radians 字段（弧度存储）显示为角度（*180/π）；数值保留两位
   - color：颜色选择器，值先经 toHex6 规范化为 #rrggbb
   - range：滑块；用 scale（默认 100）把 0~1 之类的小数放大为整数滑位
   - checkbox：勾选框
   - select：下拉，按 options 生成并高亮当前值
   data-key 记录属性名，供 bind 阶段回写到部件字段 */
function buildPropertyField(prop, value) {
    if (prop.type === 'number') {
        let v = value;
        if (prop.radians && typeof v === 'number') v = Math.round(v * 180 / Math.PI);
        else if (typeof v === 'number') v = Math.round(v * 100) / 100;
        const min = prop.min !== undefined ? `min="${prop.min}"` : '';
        const max = prop.max !== undefined ? `max="${prop.max}"` : '';
        const step = prop.step !== undefined ? `step="${prop.step}"` : 'step="1"';
        return `<label class="field"><span>${prop.label}</span>
      <input type="number" data-key="${prop.key}" value="${v}" ${min} ${max} ${step}>
    </label>`;
    }
    if (prop.type === 'color') {
        return `<label class="field"><span>${prop.label}</span>
      <input type="color" data-key="${prop.key}" value="${toHex6(value)}">
    </label>`;
    }
    if (prop.type === 'range') {
        const scale = prop.scale || 100;
        return `<label class="field"><span>${prop.label}</span>
      <input type="range" data-key="${prop.key}" data-scale="${scale}" min="${prop.min || 0}" max="${prop.max || 100}" value="${Math.round(value * scale)}">
    </label>`;
    }
    if (prop.type === 'checkbox') {
        return `<label class="check">
      <input type="checkbox" data-key="${prop.key}" ${value ? 'checked' : ''}>
      <span>${prop.label}</span>
    </label>`;
    }
    if (prop.type === 'select') {
        const opts = (prop.options || []).map(o =>
            `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`
        ).join('');
        return `<label class="field"><span>${prop.label}</span>
      <select data-key="${prop.key}">${opts}</select>
    </label>`;
    }
    return '';
}
/* bind：为选中部件的所有属性控件挂载改动处理器。核心回写流程：
   1) 按 prop.type 把控件原始值转换回业务值（角度→弧度、滑块/scale、勾选、数字钳到 [min,max]）
   2) 写回 el[key]，并触发组件自定义 onPropertyChange 钩子（如跑道改形状需重算路径）
   3) 特例：齿轮设 isDriver 时互斥取消同场景其它齿轮的驱动态
   4) 特例：杯水位变化时局部更新对应 chip 文本，避免整块面板重绘
   说明：number/color 等“值型”监听 input 实时生效；range/checkbox/select 额外挂 change 兜底。
   这些领域特判（top/cup/gear）体现了引擎对具体组件类型的耦合，是待重构点 */
function bindPropertySection(scene) {
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) return;
    if (el.__missing) {
        const delBtn = document.getElementById('btnDeleteEl');
        if (delBtn) delBtn.onclick = () => deleteSelected();
        return;
    }
    const def = ComponentTypes[el.type];
    if (!def) return;

    panelBody.querySelectorAll('.field input[data-key], .field select[data-key], .check input[data-key]').forEach(input => {
        const key = input.dataset.key;
        const prop = (def.properties || []).find(p => p.key === key);
        if (!prop) return;
        const handler = () => {
            let v;
            if (prop.type === 'number') {
                v = parseFloat(input.value);
                if (isNaN(v)) return;
                if (prop.radians) v = v * Math.PI / 180;
                if (prop.min !== undefined) v = Math.max(prop.min, v);
                if (prop.max !== undefined) v = Math.min(prop.max, v);
            } else if (prop.type === 'color') { v = input.value; }
            else if (prop.type === 'range') { v = parseFloat(input.value) / (prop.scale || 100); }
            else if (prop.type === 'checkbox') { v = input.checked; }
            else { v = input.value; }
            el[key] = v;
            if (def.onPropertyChange) def.onPropertyChange(el, key, v, scene);
            if (key === 'isDriver' && v) {
                for (const o of scene.elements) {
                    if (o !== el && o.type === 'gear') o.isDriver = false;
                }
            }
            if (el.type === 'cup' && key === 'waterLevel') {
                const chip = panelBody.querySelector(`.chip[data-eid="${el.id}"]`);
                if (chip) {
                    const color = el.color || '#7ec8ff';
                    chip.innerHTML = `<span class="dot" style="background:${color}"></span>🥛 杯子 ${Math.round(el.waterLevel * 100)}%`;
                }
            }
        };
        input.addEventListener('input', handler);
        if (prop.type === 'color' || prop.type === 'range' || prop.type === 'checkbox' || prop.type === 'select') {
            input.addEventListener('change', handler);
        }
    });

    if (el.type === 'top') {
        const btnRestart = document.getElementById('btnRestartTop');
        if (btnRestart) btnRestart.onclick = () => {
            el.startTime = scene.time; Audio.spin(); renderPanel(); showTip('陀螺重新开始旋转');
        };
    }
    const dupBtn = document.getElementById('btnDuplicate');
    if (dupBtn) dupBtn.onclick = () => duplicateSelected();
    const delBtn = document.getElementById('btnDeleteEl');
    if (delBtn) delBtn.onclick = () => deleteSelected();
}

/* ---------- 部件操作：局部同步 / 复制 / 删除 ---------- */

/* 拖拽期间的“轻量刷新”：只更新面板里坐标类输入框(x/y/x1..y2)的数值，
   而不调用 renderPanel 全量重绘——因为重绘会销毁重建 DOM，导致
   正在编辑的输入框丢失焦点或拖拽期间频繁抖动。跳过当前聚焦的输入框，
   以免打断用户手动输入 */
export function syncPositionInputs() {
    const scene = getCurrentScene();
    if (!scene || !selectedId) return;
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) return;
    const def = ComponentTypes[el.type];
    if (!def) return;
    for (const prop of def.properties || []) {
        if (['x','y','x1','y1','x2','y2'].includes(prop.key)) {
            const input = panelBody.querySelector(`input[data-key="${prop.key}"]`);
            if (input && document.activeElement !== input) {
                input.value = Math.round(el[prop.key] * 100) / 100;
            }
        }
    }
}
/* 复制当前选中部件：JSON 深拷贝 → 重新分配 id → 偏移 24*S 避免完全重叠；
   线段型部件(x1/y1/x2/y2)整体平移；陀螺复制后重置为静止初始态。复制后选中新件 */
export function duplicateSelected() {
    const scene = getCurrentScene();
    if (!scene || !selectedId) return;
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el || el.__missing) return;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid(el.type);
    const off = 24 * S;
    if (copy.x != null) { copy.x += off; copy.y += off; }
    else if (copy.x1 != null) { copy.x1 += off; copy.y1 += off; copy.x2 += off; copy.y2 += off; }
    if (copy.type === 'top') { copy.startTime = scene.time; copy._spinPhase = 0; copy._vel = 1; copy._tilt = 0; copy._fallProgress = 0; copy._tau = 0; }
    scene.elements.push(copy);
    setSelectedId(copy.id);
    Audio.add();
    renderPanel();
    showTip('已复制');
}
/* 删除当前选中部件：从场景数组过滤掉该 id，清空选中并重绘面板 */
export function deleteSelected() {
    const scene = getCurrentScene();
    if (!scene || !selectedId) return;
    scene.elements = scene.elements.filter(e => e.id !== selectedId);
    setSelectedId(null);
    Audio.click();
    renderPanel();
    showTip('已删除');
}

/* ========== 区块六：显示（光路开关） ========== */
/* build：仅当场景含光学相关部件（cup/stick/coin/eye/light）时才出现，
   提供“显示/隐藏光路”切换按钮（对应 loop.js 的 drawLightRays） */
function buildDisplaySection(scene) {
    const hasOptical = scene.elements.some(e => ['cup','stick','coin','eye','light'].includes(e.type));
    if (!hasOptical) return '';
    return `<div class="section">
    <div class="section-title"><span>显示</span></div>
    <button class="btn full" id="btnRays">${scene.showRays ? '🔦 隐藏光路' : '🔦 显示光路'}</button>
  </div>`;
}
/* bind：切换 scene.showRays；已开启时给按钮加高亮底色以示激活态 */
function bindDisplaySection(scene) {
    const btn = document.getElementById('btnRays');
    if (!btn) return;
    if (scene.showRays) { btn.style.background = 'rgba(255,213,79,.28)'; btn.style.borderColor = '#ffd54f'; }
    btn.onclick = () => { scene.showRays = !scene.showRays; Audio.click(); renderPanel(); };
}

/* ========== 区块七：导入 / 导出 ========== */
/* build：四种导出（选中部件/当前场景/全部场景 + 重置示例）、
   文件导入（.json）与文本粘贴导入。具体序列化/解析逻辑委托 io.js */
function buildIOSection(scene) {
    return `<div class="section">
    <div class="section-title"><span>导入 / 导出</span></div>
    <div class="btn-row">
      <button class="btn" data-io="exportSel">⬇ 选中部件</button>
      <button class="btn" data-io="exportScene">⬇ 当前场景</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-io="exportAll">⬇ 全部场景</button>
      <button class="btn" data-io="reset">↺ 重置示例</button>
    </div>
    <label class="btn full file">⬆ 导入文件
      <input type="file" id="fileInput" accept=".json,application/json">
    </label>
    <textarea class="io-text" id="ioText" placeholder="粘贴场景 JSON 到此处"></textarea>
    <button class="btn full" data-io="importText">从文本导入场景</button>
  </div>`;
}
/* bind：各导出按钮调用 downloadJSON 打包对应粒度数据；
   重置回默认示例场景（confirm 防误触）；文件/文本导入统一走 importData
   （其内部按数据形态智能分发并兼容遗留格式）。
   注：exportScene 文件名直接用 scene.name，若含非法字符可能生成无效文件名，属小隐患 */
function bindIOSection(scene) {
    const q = s => panelBody.querySelector(s);
    q('[data-io="exportSel"]').onclick = () => {
        if (!selectedId) { showTip('请先选中一个部件', true); return; }
        const el = scene.elements.find(e => e.id === selectedId);
        if (!el) return;
        downloadJSON(`component-${el.type}.json`, { type: 'component', version: 1, component: serializeElement(el) });
        showTip('已导出选中部件');
    };
    q('[data-io="exportScene"]').onclick = () => {
        downloadJSON(`${scene.name}.json`, { type: 'scene', version: 1, scene: serializeScene(scene) });
        showTip('已导出当前场景');
    };
    q('[data-io="exportAll"]').onclick = () => {
        downloadJSON('workspace.json', { type: 'workspace', version: 1, scenes: Scenes.map(serializeScene) });
        showTip(`已导出 ${Scenes.length} 个实验`);
    };
    q('[data-io="reset"]').onclick = () => {
        if (!confirm('重置为示例实验？当前所有编辑会丢失。')) return;
        initDefaultScenes();
        showTip('已重置');
    };
    const fileInput = q('#fileInput');
    fileInput.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { importData(JSON.parse(reader.result)); }
            catch (err) { showTip('导入失败：' + err.message, true); }
        };
        reader.onerror = () => showTip('文件读取失败', true);
        reader.readAsText(file);
        e.target.value = '';
    };
    q('[data-io="importText"]').onclick = () => {
        const txt = q('#ioText').value.trim();
        if (!txt) { showTip('请先粘贴 JSON 文本', true); return; }
        try { importData(JSON.parse(txt)); q('#ioText').value = ''; }
        catch (err) { showTip('导入失败：' + err.message, true); }
    };
}