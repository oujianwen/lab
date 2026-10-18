/* ============================================================
   物理实验室 —— 入口模块
   本文件只做三件事：装配模块、安装全局桥、启动主循环
   ============================================================ */
import { installGlobals } from './globals.js';
import {
    resize,
    bindEvents,
    loop,
    initDefaultScenes
} from './engine/loop.js';
import {
    loadPersistedPlugins,
    loadAutoComponents
} from './engine/plugins.js';
// 触发内置组件注册（齿轮/杯子/木棍/硬币/眼睛/光源/陀螺），必须在 init() 前执行
import './components/builtin.js';
import { initRaceScene } from './engine/scenes.js';

async function init() {
    // 1) 先把 W/H/S/time/showTip/Audio 等挂回 window，
    //    供 new Function 方式加载的外部部件读取
    installGlobals();

    // 2) 初始化画布尺寸、DPR、缩放系数 S
    resize();

    // 3) 先恢复 localStorage 里的外部组件（旧版）
    loadPersistedPlugins();

    // 4) 建立预置场景（齿轮 / 折射 / 陀螺）
    initDefaultScenes();

    // 5) 绑定指针、键盘、resize、拖拽导入等事件
    bindEvents();

    // 6) 启动主循环
    requestAnimationFrame(loop);

    // 7) 读取 manifest.json，自动加载 js/components/*.js
    //    带 overwrite，会用文件里的最新版静默覆盖上一步恢复的旧版
    await loadAutoComponents();

    // 8) 部件就绪后，构建依赖外部部件的「龟兔赛跑」预置场景
    initRaceScene();
}

init();