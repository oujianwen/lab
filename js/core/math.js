/* ============================================================
   核心数学 / 几何 / 颜色工具库
   ------------------------------------------------------------
   纯函数集合，无副作用、不依赖 DOM，供渲染管线、物理系统与交互层复用。
   大致分为三类：
   1) 数值与插值：clamp / dist / inv / smooth
   2) 颜色处理：parseHex / toHex6 / mixHex / hexA
   3) 路径与几何：roundRectPath / distToSegment
   说明：这些工具同时通过 globals.js 暴露到 window，供 new Function
   方式加载的外挂组件读取（因此各组件应优先复用而非重复实现）。
   ============================================================ */

/* ---------- 基础数学 ---------- */

/* 将数值 v 限制在 [a, b] 区间内（下限与上限钳制） */
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* 计算两点 a、b 之间的欧氏距离（使用 hypot 避免平方相加的溢出问题） */
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/* 反向插值：把处于区间 [a, b] 内的值 t 归一化到 [0, 1]（区间外会被 clamp 截断）
   常用于将时间进度映射为动画进度 */
export function inv(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }

/* 平滑插值（smoothstep）：对 [0,1] 的 t 施加 3t²-2t³ 缓动曲线，
   使动画在起止处更缓和（消除线性运动的生硬感） */
export function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

/* ---------- 颜色处理 ---------- */

/* 解析十六进制颜色字符串为 {r,g,b} 分量对象（各分量 0~255）。
   - 容错：非字符串输入返回默认蓝灰色 {120,160,220}
   - 支持 #rgb 缩写（自动展开为 #rrggbb）与可选的前导 #
   - 非法 6 位十六进制同样回退到默认色，保证渲染不会因脏数据崩溃 */
export function parseHex(h) {
    if (typeof h !== 'string') return { r: 120, g: 160, b: 220 };
    let s = h.replace('#', '').trim();
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return { r: 120, g: 160, b: 220 };
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* 将任意颜色输入规范化为标准 6 位十六进制字符串（#rrggbb）。
   先经 parseHex 容错解析，再逐分量四舍五入并补齐两位，供 <input type=color> 等使用 */
export function toHex6(h) {
    const c = parseHex(h);
    return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/* 颜色线性插值：在颜色 a 与 b 之间按 t∈[0,1] 混合，
   t=0 得 a、t=1 得 b。常用于生成渐变的高光/阴影（与白色或黑色混合） */
export function mixHex(a, b, t) {
    const A = parseHex(a), B = parseHex(b);
    return '#' + ['r','g','b'].map(k =>
        Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')
    ).join('');
}

/* 将十六进制颜色转换为带 alpha 的 rgba(...) CSS 字符串，
   用于半透明填充/描边（a 一般取 0~1） */
export function hexA(hex, a) {
    const c = parseHex(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/* ---------- 路径与几何 ---------- */

/* 在 Canvas 上下文 c 上构建一条圆角矩形路径（仅生成路径，不填充/描边，由调用方决定）。
   x,y 为左上角，w,h 为宽高，r 为目标圆角半径；
   这里取 min(r, w/2, h/2) 防止圆角半径超过边长导致绘制畸形 */
export function roundRectPath(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
}

/* 计算点 p 到线段 ab 的最短距离（点到线段而非直线的距离）。
   思路：求 p 在 ab 上的投影参数 t（点积 / 长度平方），
   将 t 钳制到 [0,1] 使落点限制在线段范围内，再算 p 到该落点的距离。
   退化情况（a、b 重合，len2=0）直接返回点间距离。
   常用于木棍等线段型部件的命中检测 */
export function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
