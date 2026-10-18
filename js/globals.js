// 把组件 new Function 环境需要的符号显式暴露回全局。
// 用 namespace import 读取 live bindings，保证部件拿到实时值。
import * as state from './core/state.js';
import { showTip } from './core/toast.js';
import { Audio } from './core/audio.js';
import * as math from './core/math.js';

export function installGlobals() {
    Object.defineProperty(window, 'W', { get: () => state.W });
    Object.defineProperty(window, 'H', { get: () => state.H });
    Object.defineProperty(window, 'S', { get: () => state.S });
    Object.defineProperty(window, 'DPR', { get: () => state.DPR });
    Object.defineProperty(window, 'time', { get: () => state.time });
    window.showTip = showTip;
    window.Audio = Audio;
    Object.assign(window, math);
}