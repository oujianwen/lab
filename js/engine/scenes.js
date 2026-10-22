/* ============================================================
   场景管理 —— 场景容器 / 创建 / 预置示例 / 切换 / 依赖外部件的特殊场景
   ------------------------------------------------------------
   “场景(Scene)”= 一个实验，承载一组部件(elements)。本模块负责：
     - Scenes：全局场景数组 + currentSceneId 当前场景指针（内存态工作区）
     - createScene / addElement：场景与部件的工厂
     - create*Scene：三个内置预置示例场景（齿轮 / 折射 / 陀螺）
     - 场景切换与标签栏渲染、新建 / 删除场景
     - 龟兔赛跑场景：依赖外部组件，须在部件加载完成后单独构建
   依赖：与 loop.js 双向引用（renderPanel/状态 setter 等来自 loop），
   靠 ES module live binding 在运行时安全调用。
   持久化说明：Scenes 仅存于内存，刷新即丢失（不像插件写 localStorage）；
   跨会话保存依赖 io.js 的导入导出（平台化后应接入后端，见代码评审）。
   ============================================================ */
import { uid, W, H, S } from '../core/state.js';
import { ComponentTypes } from './registry.js';
import { canvas, sceneTabsEl } from '../core/dom.js';
import { showTip } from '../core/toast.js';
import { escapeHtml } from './loop.js';
import { renderPanel, setSelectedId, setDragging, setDraggingHandle, setPlacingType } from './loop.js';

/* 全局场景数组（内存工作区，引用不变、内容增删的单例） */
export const Scenes = [];
/* 当前场景 id；用 export let 活绑定导出，配合 setter 收敛写入 */
export let currentSceneId = null;
export function setCurrentSceneId(id) { currentSceneId = id; }

/* ---------- 场景工厂 ----------
   创建一个空场景对象。opts 可覆盖名称/图标/初始部件/背景；
   showRays 控制光学光路显隐，time 为场景自身累计时长（供陀螺等按绝对时间求物理态） */
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
/* 取当前场景实例；找不到返回 null（渲染/交互层需容错） */
export function getCurrentScene() { return Scenes.find(s => s.id === currentSceneId) || null; }

/* ---------- 向场景添加部件 ----------
   以组件 defaults() 为蓝本创建实例并赋 id/type，再按坐标约定摆放：
     - 点定位件(x,y)：直接置位
     - 线段件(x1,y1,x2,y2)：以其中点为锚，整体平移到点击处
     - 其余：交给组件自定义 onPlace 钩子（如跑道按形状自动生成路径点）
   陀螺特殊：记录 startTime=scene.time，使其从“当前时刻”开始旋转（物理闭式解依赖它）
   返回新建实例（供调用方进一步 Object.assign 覆盖参数，预置场景即用此法） */
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

/* ---------- 预置场景 ----------
   以下三个示例场景直接依赖内置组件（gear/cup/stick/coin/eye/top），
   通过 addElement + Object.assign 精确摆位与设参，构造出可演示物理现象的默认实验。
   坐标以 W/H 相对定位，保证不同窗口尺寸下布局合理 */

/* 齿轮示例：一个驱动齿轮 + 两个啮合齿轮，演示传动比 */
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
/* 折射示例：杯+水下木棍、杯+水下硬币、眼睛，用于演示光的折射造成“弯折/抬高”视效 */
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
/* 陀螺示例：四个重心高度/轴尖形状不同的陀螺，对比演示稳定时长差异 */
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

/* 渲染顶部场景标签栏：为每个场景生成一个可点击 Tab（含图标/名称/关闭按钮），
   当前场景加 active 高亮；仅当场景数 >1 时才显示关闭按钮（避免关掉最后一个）。
   名称经 escapeHtml 防注入。随后为各 Tab 绑定：点关闭→确认删除并切相邻场景，
   点标签本体→切换当前场景 */
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
/* 切换到指定场景：校验存在后置为当前场景，并清除“选中/拖拽/放置”等瞬时交互态
   （不同场景间这些状态不应串用），重置光标、刷新标签栏与属性面板 */
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
/* 新建空白场景：prompt 取名（取消则不建），追加进 Scenes 并切换过去 */
export function createNewScene() {
    const name = prompt('给这个新实验起个名字：', '我的实验');
    if (name === null) return;
    const scene = createScene({ name: name.trim() || '未命名实验', icon: '🧪' });
    Scenes.push(scene);
    switchToScene(scene.id);
    showTip('新实验已创建，从组件库添加部件吧');
}

/* ---------- 龟兔赛跑（依赖外部部件，需在部件加载完成后调用） ---------- */
/* 该场景用到 race_track/turtle/rabbit 等“外部组件”，
   因此不能在 initDefaultScenes 阶段（外部件尚未加载）创建，
   必须由 app.js 在 loadAutoComponents 之后再调 initRaceScene 构建 */
export function createRaceScene() {
    const scene = createScene({ name: '龟兔赛跑', icon: '🏁' });
    addElement(scene, 'race_track');
    addElement(scene, 'turtle', W * 0.2, H * 0.5);
    addElement(scene, 'rabbit', W * 0.2, H * 0.5);
    return scene;
}
/* 安全构建龟兔场景：
   - 部件未就绪则打警告并跳过（提示核对 manifest 是否包含这三件）
   - 已存在同名场景则跳过，防止重复加载
   满足条件后创建、追加并切换过去 */
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
