/* ---------- 基础数学 ---------- */
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function inv(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
export function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function parseHex(h) {
    if (typeof h !== 'string') return { r: 120, g: 160, b: 220 };
    let s = h.replace('#', '').trim();
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return { r: 120, g: 160, b: 220 };
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function toHex6(h) {
    const c = parseHex(h);
    return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
export function mixHex(a, b, t) {
    const A = parseHex(a), B = parseHex(b);
    return '#' + ['r','g','b'].map(k =>
        Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')
    ).join('');
}
export function hexA(hex, a) {
    const c = parseHex(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
}
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
export function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
