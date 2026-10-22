/* ============================================================
   DOM 引用集中缓存模块
   ------------------------------------------------------------
   作用：在应用启动时一次性获取 index.html 中的关键 DOM 节点，
   并以 ES module 单例的形式对外导出。其他模块通过 import 复用这些
   引用，避免在各处反复调用 document.getElementById（减少重复查询、
   统一入口、便于维护节点与 id 的对应关系）。
   注意：本模块在加载即求值，故依赖 index.html 中的相应元素已存在于
   DOM（脚本以 type=module 置于 body 末尾，天然满足该前提）。
   ============================================================ */
export const stage      = document.getElementById('stage');      // 画布外层容器：承载 canvas 与 HUD，用于尺寸测量与 ResizeObserver 监听
export const canvas     = document.getElementById('c');          // 主渲染画布：所有实验场景绘制于此，并绑定指针交互事件
export const ctx        = canvas.getContext('2d');               // 画布的 2D 绘图上下文：全局唯一，渲染管线直接使用该句柄绘制
export const panel      = document.getElementById('panel');      // 右侧属性面板：支持折叠/展开（切换 .collapsed 类）
export const panelBody  = document.getElementById('panelBody');  // 面板内容容器：panel.js 通过 innerHTML 渲染各功能区块
export const toastEl    = document.getElementById('toast');      // 轻提示（Toast）元素：toast.js 控制其显示文案与显隐动画
export const sceneTabsEl = document.getElementById('sceneTabs'); // 顶部场景标签栏：scenes.js 渲染实验切换 Tab 并绑定点击
export const hudEl      = document.getElementById('hud');        // 画布叠加信息层（HUD）：loop.js 写入陀螺等实时状态文本
