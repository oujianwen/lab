/* ============================================================
   右侧面板 UI：渲染 / 各区块 build & bind / 部件操作
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
import { loadComponentFromCode } from './plugins.js';   // ← 新增这行

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
function bindElementListSection(scene) {
    panelBody.querySelectorAll('.chip[data-eid]').forEach(chip => {
        chip.onclick = () => {
            setSelectedId(chip.dataset.eid);
            Audio.click();
            renderPanel();
        };
    });
}

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
export function deleteSelected() {
    const scene = getCurrentScene();
    if (!scene || !selectedId) return;
    scene.elements = scene.elements.filter(e => e.id !== selectedId);
    setSelectedId(null);
    Audio.click();
    renderPanel();
    showTip('已删除');
}

function buildDisplaySection(scene) {
    const hasOptical = scene.elements.some(e => ['cup','stick','coin','eye','light'].includes(e.type));
    if (!hasOptical) return '';
    return `<div class="section">
    <div class="section-title"><span>显示</span></div>
    <button class="btn full" id="btnRays">${scene.showRays ? '🔦 隐藏光路' : '🔦 显示光路'}</button>
  </div>`;
}
function bindDisplaySection(scene) {
    const btn = document.getElementById('btnRays');
    if (!btn) return;
    if (scene.showRays) { btn.style.background = 'rgba(255,213,79,.28)'; btn.style.borderColor = '#ffd54f'; }
    btn.onclick = () => { scene.showRays = !scene.showRays; Audio.click(); renderPanel(); };
}
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