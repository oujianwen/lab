/* ============================================================
   物理实验室 —— 开放实验平台 + 组件插件系统
   ============================================================ */

const stage   = document.getElementById('stage');
const canvas  = document.getElementById('c');
const ctx     = canvas.getContext('2d');
const panel   = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const toastEl = document.getElementById('toast');
const sceneTabsEl = document.getElementById('sceneTabs');
const hudEl   = document.getElementById('hud');

let W = 800, H = 600, S = 1, DPR = 1;
let time = 0;
let uidCounter = 1;
function uid(prefix) { return (prefix || 'e') + '_' + (uidCounter++); }

/* ---------- 基础数学 ---------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function inv(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function parseHex(h) {
    if (typeof h !== 'string') return { r: 120, g: 160, b: 220 };
    let s = h.replace('#', '').trim();
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return { r: 120, g: 160, b: 220 };
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex6(h) {
    const c = parseHex(h);
    return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, t) {
    const A = parseHex(a), B = parseHex(b);
    return '#' + ['r','g','b'].map(k =>
        Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')
    ).join('');
}
function hexA(hex, a) {
    const c = parseHex(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function roundRectPath(c, x, y, w, h, r) {
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
function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/* ---------- 音效 ---------- */
const Audio = {
    ctx: null,
    init() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
    },
    beep(freq, dur, vol = 0.08, type = 'sine', delay = 0) {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        o.connect(g);
        g.connect(this.ctx.destination);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.start(t0);
        o.stop(t0 + dur);
    },
    grab()  { this.beep(620, 0.06, 0.05, 'triangle'); },
    drop()  { this.beep(420, 0.07, 0.05, 'triangle'); },
    clack() { this.beep(880, 0.06, 0.08, 'square'); this.beep(660, 0.10, 0.05, 'triangle', 0.04); },
    click() { this.beep(520, 0.06, 0.05, 'triangle'); },
    add()   { this.beep(660, 0.05, 0.05, 'sine'); this.beep(880, 0.08, 0.05, 'sine', 0.05); },
    spin()  { this.beep(440, 0.10, 0.05, 'sawtooth'); this.beep(660, 0.15, 0.05, 'sawtooth', 0.08); }
};

/* ============================================================
   内置组件
   ============================================================ */
const ComponentTypes = {};

/* --- 齿轮 --- */
ComponentTypes.gear = {
    label: '齿轮', icon: '⚙️', category: 'mechanical', color: '#5eb3ff',
    defaults() {
        return { teeth: 16, color: '#5eb3ff', angle: 0, speed: 0.9,
            isDriver: false, draggable: true, x: 200, y: 200 };
    },
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return env.MODULE * el.teeth / 2 + env.MODULE * 0.95; },
    hitTest(el, p, env) { return dist(p, el) < this.getRadius(el, env) + 12 * env.S; },
    properties: [
        { key: 'teeth', label: '齿数', type: 'number', min: 6, max: 60, step: 1 },
        { key: 'color', label: '颜色', type: 'color' },
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'speed', label: '转速', type: 'number', step: 0.1, min: -5, max: 5 },
        { key: 'isDriver', label: '驱动齿轮', type: 'checkbox' },
        { key: 'draggable', label: '可拖动', type: 'checkbox' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            const r = env.MODULE * el.teeth / 2;
            const toothH = env.MODULE * 0.95;
            const step = Math.PI * 2 / el.teeth;
            const colorLight = mixHex(el.color, '#ffffff', 0.62);
            const colorDark = mixHex(el.color, '#000000', 0.45);
            c.save();
            c.translate(el.x, el.y);
            c.rotate(el.angle);
            c.save();
            c.globalAlpha = 0.35;
            c.translate(4 * env.S, 8 * env.S);
            c.beginPath();
            c.arc(0, 0, r + toothH * 0.6, 0, Math.PI * 2);
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.fill();
            c.restore();
            c.beginPath();
            for (let i = 0; i < el.teeth; i++) {
                const a0 = i * step, a1 = a0 + step * 0.22, a2 = a0 + step * 0.78, a3 = a0 + step;
                const x1 = Math.cos(a0) * r, y1 = Math.sin(a0) * r;
                const x2 = Math.cos(a1) * (r + toothH), y2 = Math.sin(a1) * (r + toothH);
                const x3 = Math.cos(a2) * (r + toothH), y3 = Math.sin(a2) * (r + toothH);
                const x4 = Math.cos(a3) * r, y4 = Math.sin(a3) * r;
                if (i === 0) c.moveTo(x1, y1); else c.lineTo(x1, y1);
                c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4);
            }
            c.closePath();
            const grad = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r + toothH);
            grad.addColorStop(0, colorLight);
            grad.addColorStop(0.55, el.color);
            grad.addColorStop(1, colorDark);
            c.fillStyle = grad;
            c.fill();
            c.strokeStyle = colorDark;
            c.lineWidth = 2 * env.S;
            c.stroke();
            c.beginPath();
            c.arc(0, 0, r * 0.72, 0, Math.PI * 2);
            const inner = c.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.05, 0, 0, r * 0.72);
            inner.addColorStop(0, colorLight);
            inner.addColorStop(0.7, el.color);
            inner.addColorStop(1, colorDark);
            c.fillStyle = inner;
            c.fill();
            c.strokeStyle = colorDark;
            c.lineWidth = 1.5 * env.S;
            c.stroke();
            c.strokeStyle = colorDark;
            c.lineWidth = 4 * env.S;
            c.lineCap = 'round';
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2;
                c.beginPath();
                c.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
                c.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
                c.stroke();
            }
            c.beginPath();
            c.arc(0, 0, r * 0.20, 0, Math.PI * 2);
            c.fillStyle = '#1a2035';
            c.fill();
            c.strokeStyle = colorLight;
            c.lineWidth = 2 * env.S;
            c.stroke();
            c.beginPath();
            c.arc(r * 0.48, 0, r * 0.10, 0, Math.PI * 2);
            c.fillStyle = '#fff';
            c.fill();
            c.beginPath();
            c.arc(r * 0.48, 0, r * 0.05, 0, Math.PI * 2);
            c.fillStyle = colorDark;
            c.fill();
            c.restore();
            c.save();
            c.translate(el.x, el.y - r - toothH - 18 * env.S);
            c.font = `bold ${13 * env.S}px system-ui, sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            const text = `${el.teeth} 齿`;
            const tw = c.measureText(text).width;
            const padX = 9 * env.S;
            c.fillStyle = 'rgba(0,0,0,0.55)';
            roundRectPath(c, -tw / 2 - padX, -12 * env.S, tw + padX * 2, 24 * env.S, 12 * env.S);
            c.fill();
            c.fillStyle = colorLight;
            c.fillText(text, 0, 1);
            c.restore();
            if (el.isDriver) {
                c.save();
                c.translate(el.x, el.y);
                const pulse = 1 + Math.sin(env.time * 3) * 0.08;
                c.beginPath();
                c.arc(0, 0, (r + toothH + 14 * env.S) * pulse, 0, Math.PI * 2);
                c.strokeStyle = 'rgba(120, 200, 255, 0.55)';
                c.lineWidth = 2 * env.S;
                c.setLineDash([6 * env.S, 5 * env.S]);
                c.stroke();
                c.setLineDash([]);
                c.restore();
            }
        }
    }
};

/* --- 杯子 --- */
ComponentTypes.cup = {
    label: '杯子', icon: '🥛', category: 'optical', color: '#7ec8ff',
    defaults() {
        return { x: 200, y: 200, w: 160, h: 240, waterLevel: 0.5, refraction: 1.33 };
    },
    getPosition(el) { return { x: el.x + el.w / 2, y: el.y + el.h / 2 }; },
    setPosition(el, x, y) { el.x = x - el.w / 2; el.y = y - el.h / 2; },
    getRadius(el, env) { return Math.max(el.w, el.h) / 2 + 6 * env.S; },
    hitTest(el, p, env) {
        return p.x >= el.x - 4 && p.x <= el.x + el.w + 4 &&
            p.y >= el.y - 4 && p.y <= el.y + el.h + el.w * 0.1 + 4;
    },
    properties: [
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'w', label: '宽', type: 'number', min: 40 },
        { key: 'h', label: '高', type: 'number', min: 40 },
        { key: 'waterLevel', label: '水位', type: 'range', min: 0, max: 100, scale: 100 },
        { key: 'refraction', label: '折射率', type: 'number', step: 0.01, min: 1, max: 2.5 }
    ],
    render: {
        back(el, scene, env) {
            const c = env.ctx;
            c.save();
            c.globalAlpha = 0.35;
            c.beginPath();
            c.ellipse(el.x + el.w / 2, el.y + el.h + 3 * env.S, el.w * 0.55, 6 * env.S, 0, 0, Math.PI * 2);
            c.fillStyle = '#000';
            c.fill();
            c.restore();
            c.beginPath();
            c.moveTo(el.x, el.y);
            c.lineTo(el.x, el.y + el.h);
            c.quadraticCurveTo(el.x + el.w / 2, el.y + el.h + el.w * 0.10, el.x + el.w, el.y + el.h);
            c.lineTo(el.x + el.w, el.y);
            c.closePath();
            const bg = c.createLinearGradient(el.x, 0, el.x + el.w, 0);
            bg.addColorStop(0, 'rgba(80, 110, 150, 0.15)');
            bg.addColorStop(0.5, 'rgba(120, 150, 190, 0.08)');
            bg.addColorStop(1, 'rgba(80, 110, 150, 0.15)');
            c.fillStyle = bg;
            c.fill();
            if (el.waterLevel > 0.01) {
                const waterY = el.y + el.h * (1 - el.waterLevel * 0.92);
                c.save();
                c.beginPath();
                c.moveTo(el.x, el.y);
                c.lineTo(el.x, el.y + el.h);
                c.quadraticCurveTo(el.x + el.w / 2, el.y + el.h + el.w * 0.10, el.x + el.w, el.y + el.h);
                c.lineTo(el.x + el.w, el.y);
                c.closePath();
                c.clip();
                const wg = c.createLinearGradient(0, waterY, 0, el.y + el.h);
                wg.addColorStop(0, 'rgba(140, 210, 250, 0.55)');
                wg.addColorStop(0.5, 'rgba(70, 160, 230, 0.72)');
                wg.addColorStop(1, 'rgba(30, 100, 180, 0.88)');
                c.fillStyle = wg;
                c.fillRect(el.x, waterY, el.w, el.y + el.h - waterY);
                c.beginPath();
                for (let i = 0; i <= 40; i++) {
                    const t = i / 40;
                    const px = el.x + el.w * t;
                    const wave = Math.sin(t * 8 + env.time * 2) * 1.5 * env.S;
                    if (i === 0) c.moveTo(px, waterY + wave);
                    else c.lineTo(px, waterY + wave);
                }
                c.strokeStyle = 'rgba(220, 245, 255, 0.85)';
                c.lineWidth = 2 * env.S;
                c.stroke();
                c.restore();
            }
        },
        front(el, scene, env) {
            const c = env.ctx;
            c.beginPath();
            c.moveTo(el.x, el.y);
            c.lineTo(el.x, el.y + el.h);
            c.quadraticCurveTo(el.x + el.w / 2, el.y + el.h + el.w * 0.10, el.x + el.w, el.y + el.h);
            c.lineTo(el.x + el.w, el.y);
            c.strokeStyle = 'rgba(200, 225, 245, 0.75)';
            c.lineWidth = 2.5 * env.S;
            c.stroke();
            c.beginPath();
            c.ellipse(el.x + el.w / 2, el.y, el.w / 2, 5 * env.S, 0, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(200, 225, 245, 0.85)';
            c.lineWidth = 2 * env.S;
            c.stroke();
            c.beginPath();
            c.moveTo(el.x + el.w * 0.15, el.y + 20 * env.S);
            c.lineTo(el.x + el.w * 0.15, el.y + el.h * 0.6);
            c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            c.lineWidth = 3 * env.S;
            c.lineCap = 'round';
            c.stroke();
        }
    }
};

/* --- 木棍 --- */
ComponentTypes.stick = {
    label: '木棍', icon: '🥢', category: 'optical', color: '#e8d4a0',
    defaults() {
        return { x1: 100, y1: 100, x2: 180, y2: 300, width: 8, color: '#e8d4a0' };
    },
    getPosition(el) { return { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 }; },
    setPosition(el, x, y) {
        const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
        const dx = x - cx, dy = y - cy;
        el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy;
    },
    getRadius(el, env) { return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) / 2 + el.width * env.S + 8 * env.S; },
    hitTest(el, p, env) {
        return distToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < el.width * env.S / 2 + 12 * env.S;
    },
    getHandles(el) { return [{ id: 'p1', x: el.x1, y: el.y1 }, { id: 'p2', x: el.x2, y: el.y2 }]; },
    onHandleDrag(el, handleId, p) {
        if (handleId === 'p1') { el.x1 = p.x; el.y1 = p.y; }
        if (handleId === 'p2') { el.x2 = p.x; el.y2 = p.y; }
    },
    properties: [
        { key: 'x1', label: 'X1', type: 'number' },
        { key: 'y1', label: 'Y1', type: 'number' },
        { key: 'x2', label: 'X2', type: 'number' },
        { key: 'y2', label: 'Y2', type: 'number' },
        { key: 'width', label: '粗细', type: 'number', min: 2, max: 30 },
        { key: 'color', label: '颜色', type: 'color' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            let cup = null;
            for (const o of scene.elements) {
                if (o.type !== 'cup' || o.waterLevel < 0.01) continue;
                const waterY = o.y + o.h * (1 - o.waterLevel * 0.92);
                const yMax = Math.max(el.y1, el.y2);
                if (yMax <= waterY) continue;
                const xMin = Math.min(el.x1, el.x2), xMax = Math.max(el.x1, el.x2);
                if (xMax < o.x || xMin > o.x + o.w) continue;
                cup = o; break;
            }
            if (cup) {
                const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
                const shift = 1 - 1 / (cup.refraction || 1.33);
                const dy = el.y2 - el.y1;
                const tWater = Math.abs(dy) < 0.0001 ? (el.y1 > waterY ? 0 : 1) : (waterY - el.y1) / dy;
                if (tWater > 0 && tWater < 1) {
                    if (el.y1 < el.y2) {
                        drawStickSegment(c, el, env, 0, tWater, false, null);
                        drawStickSegment(c, el, env, tWater, 1, true, { waterY, shift });
                    } else {
                        drawStickSegment(c, el, env, 0, tWater, true, { waterY, shift });
                        drawStickSegment(c, el, env, tWater, 1, false, null);
                    }
                    return;
                }
                if (tWater <= 0) {
                    drawStickSegment(c, el, env, 0, 1, true, { waterY, shift });
                    return;
                }
            }
            drawStickSegment(c, el, env, 0, 1, false, null);
        }
    }
};
function drawStickSegment(c, el, env, t0, t1, underwater, info) {
    if (t1 <= t0) return;
    const lw = el.width * env.S;
    if (underwater && info) {
        const segs = 24;
        c.beginPath();
        for (let i = 0; i <= segs; i++) {
            const t = t0 + (t1 - t0) * i / segs;
            const ax = el.x1 + (el.x2 - el.x1) * t;
            const ay = el.y1 + (el.y2 - el.y1) * t;
            const depth = Math.max(0, ay - info.waterY);
            const vy = ay - depth * info.shift;
            if (i === 0) c.moveTo(ax, vy); else c.lineTo(ax, vy);
        }
        c.strokeStyle = el.color;
        c.lineWidth = lw;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.stroke();
        c.strokeStyle = 'rgba(120,80,40,0.5)';
        c.lineWidth = 1.5 * env.S;
        c.stroke();
    } else {
        const ax0 = el.x1 + (el.x2 - el.x1) * t0;
        const ay0 = el.y1 + (el.y2 - el.y1) * t0;
        const ax1 = el.x1 + (el.x2 - el.x1) * t1;
        const ay1 = el.y1 + (el.y2 - el.y1) * t1;
        c.beginPath();
        c.moveTo(ax0, ay0);
        c.lineTo(ax1, ay1);
        c.strokeStyle = el.color;
        c.lineWidth = lw;
        c.lineCap = 'round';
        c.stroke();
        c.strokeStyle = 'rgba(120,80,40,0.5)';
        c.lineWidth = 1.5 * env.S;
        c.stroke();
        c.beginPath();
        c.moveTo(ax0 - 2 * env.S, ay0);
        c.lineTo(ax1 - 2 * env.S, ay1);
        c.strokeStyle = 'rgba(255,255,255,0.45)';
        c.lineWidth = 1.5 * env.S;
        c.stroke();
    }
}

/* --- 硬币 --- */
ComponentTypes.coin = {
    label: '硬币', icon: '🪙', category: 'optical', color: '#f0b93a',
    defaults() { return { x: 200, y: 300, r: 22, color: '#f0b93a' }; },
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return el.r + 10 * env.S; },
    properties: [
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'r', label: '半径', type: 'number', min: 5 },
        { key: 'color', label: '颜色', type: 'color' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            let cup = null;
            for (const o of scene.elements) {
                if (o.type !== 'cup') continue;
                if (el.x >= o.x && el.x <= o.x + o.w && el.y >= o.y && el.y <= o.y + o.h) { cup = o; break; }
            }
            let visualY = el.y, visibility = 1;
            if (cup && cup.waterLevel > 0.01) {
                const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
                if (el.y > waterY) {
                    const shift = 1 - 1 / (cup.refraction || 1.33);
                    visualY = el.y - (el.y - waterY) * shift;
                    visibility = Math.min(1, cup.waterLevel / 0.5 + 0.15);
                }
            }
            if (visibility > 0.01) {
                c.save();
                c.globalAlpha = visibility;
                c.beginPath();
                c.ellipse(el.x + 2 * env.S, visualY + el.r * 0.4, el.r * 1.05, el.r * 0.32, 0, 0, Math.PI * 2);
                c.fillStyle = 'rgba(0,0,0,0.4)';
                c.fill();
                c.beginPath();
                c.ellipse(el.x, visualY, el.r, el.r * 0.32, 0, 0, Math.PI * 2);
                const g = c.createRadialGradient(el.x - el.r * 0.3, visualY - el.r * 0.1, el.r * 0.05, el.x, visualY, el.r * 1.1);
                g.addColorStop(0, '#ffe894');
                g.addColorStop(0.5, el.color);
                g.addColorStop(1, '#8a5a10');
                c.fillStyle = g;
                c.fill();
                c.strokeStyle = 'rgba(120,80,20,0.9)';
                c.lineWidth = 2 * env.S;
                c.stroke();
                c.beginPath();
                c.ellipse(el.x, visualY, el.r * 0.75, el.r * 0.24, 0, 0, Math.PI * 2);
                c.strokeStyle = 'rgba(120,80,20,0.5)';
                c.lineWidth = 1.2 * env.S;
                c.stroke();
                c.beginPath();
                c.ellipse(el.x - el.r * 0.3, visualY - el.r * 0.08, el.r * 0.3, el.r * 0.08, 0, 0, Math.PI * 2);
                c.fillStyle = 'rgba(255,255,255,0.55)';
                c.fill();
                c.restore();
            }
        }
    }
};

/* --- 眼睛 --- */
ComponentTypes.eye = {
    label: '眼睛', icon: '👁', category: 'optical', color: '#a8c8e8',
    defaults() { return { x: 100, y: 100 }; },
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return 30 * env.S; },
    properties: [
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            const r = 14 * env.S;
            c.beginPath();
            c.ellipse(el.x, el.y, r * 1.4, r, 0, 0, Math.PI * 2);
            c.fillStyle = 'rgba(255,255,255,0.92)';
            c.fill();
            c.strokeStyle = 'rgba(80,110,150,0.9)';
            c.lineWidth = 2 * env.S;
            c.stroke();
            c.beginPath();
            c.arc(el.x + r * 0.3, el.y + r * 0.15, r * 0.42, 0, Math.PI * 2);
            c.fillStyle = '#1a2030';
            c.fill();
            c.beginPath();
            c.arc(el.x + r * 0.15, el.y + r * 0.05, r * 0.15, 0, Math.PI * 2);
            c.fillStyle = 'rgba(255,255,255,0.9)';
            c.fill();
        }
    }
};

/* --- 光源 --- */
ComponentTypes.light = {
    label: '光源', icon: '💡', category: 'optical', color: '#ffe27a',
    defaults() { return { x: 100, y: 100, angle: -Math.PI / 4, color: '#ffe27a' }; },
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return 30 * env.S; },
    properties: [
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'angle', label: '角度°', type: 'number', step: 5, radians: true },
        { key: 'color', label: '颜色', type: 'color' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            const gr = c.createRadialGradient(el.x, el.y, 2 * env.S, el.x, el.y, 30 * env.S);
            gr.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
            gr.addColorStop(0.4, 'rgba(255, 200, 80, 0.35)');
            gr.addColorStop(1, 'rgba(255, 200, 80, 0)');
            c.fillStyle = gr;
            c.beginPath();
            c.arc(el.x, el.y, 30 * env.S, 0, Math.PI * 2);
            c.fill();
            c.beginPath();
            c.arc(el.x, el.y, 9 * env.S, 0, Math.PI * 2);
            c.fillStyle = el.color;
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.85)';
            c.lineWidth = 2 * env.S;
            c.stroke();
            const ex = el.x + Math.cos(el.angle) * 44 * env.S;
            const ey = el.y + Math.sin(el.angle) * 44 * env.S;
            c.beginPath();
            c.moveTo(el.x + Math.cos(el.angle) * 12 * env.S, el.y + Math.sin(el.angle) * 12 * env.S);
            c.lineTo(ex, ey);
            c.strokeStyle = 'rgba(255,220,120,0.85)';
            c.lineWidth = 2 * env.S;
            c.stroke();
            const ang = el.angle;
            c.beginPath();
            c.moveTo(ex, ey);
            c.lineTo(ex - Math.cos(ang) * 8 * env.S - Math.sin(ang) * 5 * env.S,
                ey - Math.sin(ang) * 8 * env.S + Math.cos(ang) * 5 * env.S);
            c.lineTo(ex - Math.cos(ang) * 8 * env.S + Math.sin(ang) * 5 * env.S,
                ey - Math.sin(ang) * 8 * env.S - Math.cos(ang) * 5 * env.S);
            c.closePath();
            c.fillStyle = 'rgba(255,220,120,1)';
            c.fill();
        }
    }
};

/* --- 陀螺 --- */
function topConfig(el) {
    const comFrac = clamp(el.comFrac, 0.1, 0.9);
    const tipType = el.tipType || 'sharp';
    const massDist = el.massDist || 'uniform';
    const comPenalty  = clamp((comFrac - 0.28) / 0.38, 0, 1) * 0.30;
    const tipPenalty  = tipType === 'flat' ? 0.24 : (tipType === 'round' ? 0.12 : 0);
    const massPenalty = massDist === 'center' ? 0.22 : (massDist === 'edge' ? 0 : 0.10);
    const decay = 0.14 + comPenalty + tipPenalty + massPenalty;
    const stableTime = clamp(16 - (decay - 0.14) * 20, 3.5, 16);
    return { decay, stableTime };
}
function getTopState(tau, cfg) {
    if (tau <= 0) return { spinPhase: 0, vel: 1, tilt: 0, fallProgress: 0, elapsed: 0 };
    const spinPhase = (18 / cfg.decay) * (1 - Math.exp(-cfg.decay * tau));
    const vel = Math.exp(-cfg.decay * tau);
    const fallProgress = smooth(inv(tau, cfg.stableTime, cfg.stableTime + 1.6));
    const wobble = Math.sin(tau * 5.2) * 0.05 * (1 - fallProgress);
    const tilt = fallProgress * 1.15 + wobble;
    const elapsed = Math.min(tau, cfg.stableTime + 1.6);
    return { spinPhase, vel, tilt, fallProgress, elapsed };
}
function topColors(el) {
    const c = el.color || '#3E5A7A';
    const light = mixHex(c, '#ffffff', 0.42);
    const dark  = mixHex(c, '#000000', 0.60);
    return {
        main: c, dark: dark, top: hexA(light, 0.72), stroke: hexA(light, 0.9),
        axis: 'rgba(255,217,138,0.9)', knob: 'rgba(255,217,138,0.95)',
        mark: 'rgba(255,255,255,0.88)', weight: '#FFD98A', com: '#FF7A6B'
    };
}
function drawTopRealistic(c, el, env, state) {
    const Hh = 280 * env.S * (el.size || 1);
    const R  = 90  * env.S * (el.size || 1);
    const cx = el.x, baseY = el.y;
    const col = topColors(el);
    c.save();
    c.translate(cx, baseY);
    c.rotate(state.tilt);
    const coneH = Hh * 0.30, bodyH = Hh * 0.42, neckH = Hh * 0.16, knobH = Hh * 0.12;
    const bodyBottomY = -coneH, bodyTopY = bodyBottomY - bodyH;
    const neckTopY = bodyTopY - neckH, knobCY = neckTopY - knobH * 0.45;
    const ellRy = R * 0.26;
    /* 锥体 */
    c.beginPath();
    c.moveTo(-R, bodyBottomY);
    if (el.tipType === 'sharp') {
        c.quadraticCurveTo(-R * 0.40, bodyBottomY * 0.55, -4, -5);
        c.lineTo(4, -5);
        c.quadraticCurveTo(R * 0.40, bodyBottomY * 0.55, R, bodyBottomY);
    } else if (el.tipType === 'flat') {
        c.quadraticCurveTo(-R * 0.55, bodyBottomY * 0.55, -R * 0.32, -10);
        c.lineTo(R * 0.32, -10);
        c.quadraticCurveTo(R * 0.55, bodyBottomY * 0.55, R, bodyBottomY);
    } else {
        c.quadraticCurveTo(-R * 0.45, bodyBottomY * 0.55, -R * 0.16, -14);
        c.arc(0, -14, R * 0.16, Math.PI, 0, true);
        c.quadraticCurveTo(R * 0.45, bodyBottomY * 0.55, R, bodyBottomY);
    }
    c.ellipse(0, bodyBottomY, R, ellRy, 0, 0, Math.PI, false);
    c.closePath();
    const coneGrad = c.createLinearGradient(-R, 0, R, 0);
    coneGrad.addColorStop(0, col.dark);
    coneGrad.addColorStop(0.30, col.main);
    coneGrad.addColorStop(0.70, col.main);
    coneGrad.addColorStop(1, col.dark);
    c.fillStyle = coneGrad;
    c.fill();
    c.strokeStyle = col.stroke;
    c.lineWidth = 2 * env.S;
    c.stroke();
    /* 主体 */
    c.beginPath();
    c.moveTo(-R, bodyTopY);
    c.lineTo(-R, bodyBottomY);
    c.ellipse(0, bodyBottomY, R, ellRy, 0, Math.PI, 0, false);
    c.lineTo(R, bodyTopY);
    c.closePath();
    const bodyGrad = c.createLinearGradient(-R, 0, R, 0);
    bodyGrad.addColorStop(0, col.dark);
    bodyGrad.addColorStop(0.28, col.main);
    bodyGrad.addColorStop(0.72, col.main);
    bodyGrad.addColorStop(1, col.dark);
    c.fillStyle = bodyGrad;
    c.fill();
    c.strokeStyle = col.stroke;
    c.lineWidth = 2 * env.S;
    c.stroke();
    /* 顶面 */
    c.beginPath();
    c.ellipse(0, bodyTopY, R, ellRy, 0, 0, Math.PI * 2);
    c.fillStyle = col.top;
    c.fill();
    c.strokeStyle = col.stroke;
    c.lineWidth = 2 * env.S;
    c.stroke();
    c.fillStyle = col.mark;
    for (let i = 0; i < 8; i++) {
        const a = state.spinPhase + i * Math.PI * 2 / 8;
        c.beginPath();
        c.arc(Math.cos(a) * R * 0.70, bodyTopY + Math.sin(a) * ellRy * 0.70, 3.2 * env.S, 0, Math.PI * 2);
        c.fill();
    }
    /* 质量分布 */
    if (el.massDist === 'center' || el.massDist === 'edge') {
        const n = el.massDist === 'center' ? 6 : 8;
        const rr2 = el.massDist === 'center' ? 0.24 : 0.80;
        for (let i = 0; i < n; i++) {
            const a = state.spinPhase * 1.3 + i * Math.PI * 2 / n;
            c.beginPath();
            c.arc(Math.cos(a) * R * rr2, bodyTopY + Math.sin(a) * ellRy * rr2, 7 * env.S, 0, Math.PI * 2);
            c.fillStyle = col.weight;
            c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.35)';
            c.lineWidth = 1.5 * env.S;
            c.stroke();
        }
    }
    /* 轴杆 */
    c.beginPath();
    c.moveTo(-R * 0.085, bodyTopY);
    c.lineTo(-R * 0.085, neckTopY);
    c.lineTo(R * 0.085, neckTopY);
    c.lineTo(R * 0.085, bodyTopY);
    c.closePath();
    c.fillStyle = col.axis;
    c.fill();
    c.strokeStyle = col.stroke;
    c.lineWidth = 1.5 * env.S;
    c.stroke();
    /* 旋钮 */
    c.beginPath();
    c.ellipse(0, knobCY, R * 0.22, R * 0.13, 0, 0, Math.PI * 2);
    c.fillStyle = col.knob;
    c.fill();
    c.strokeStyle = col.stroke;
    c.lineWidth = 1.5 * env.S;
    c.stroke();
    /* 重心 */
    const comY = -Hh * el.comFrac;
    const pulse = 0.5 + 0.5 * Math.sin(state.spinPhase * 0.35 + env.time * 1.2);
    c.beginPath();
    c.arc(0, comY, 8 * env.S, 0, Math.PI * 2);
    c.fillStyle = col.com;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.lineWidth = 1.5 * env.S;
    c.stroke();
    c.beginPath();
    c.arc(0, comY, 8 * env.S + 10 * pulse * env.S, 0, Math.PI * 2);
    c.strokeStyle = hexA(col.com, 0.55 * (1 - pulse));
    c.lineWidth = 2.5 * env.S;
    c.stroke();
    c.restore();
}
ComponentTypes.top = {
    label: '陀螺', icon: '🌀', category: 'mechanical', color: '#5AD1FF',
    defaults() {
        return {
            x: 300, y: 500, size: 1.0, comFrac: 0.45,
            tipType: 'sharp', massDist: 'uniform', color: '#3E5A7A',
            startTime: null, _spinPhase: 0, _vel: 1, _tilt: 0, _fallProgress: 0, _tau: 0
        };
    },
    getPosition(el) { return { x: el.x, y: el.y - 140 * S * (el.size || 1) }; },
    setPosition(el, x, y) { el.x = x; el.y = y + 140 * S * (el.size || 1); },
    getRadius(el, env) { return 95 * env.S * (el.size || 1); },
    hitTest(el, p, env) {
        const r = 95 * env.S * (el.size || 1);
        const h = 290 * env.S * (el.size || 1);
        return p.x >= el.x - r && p.x <= el.x + r && p.y >= el.y - h && p.y <= el.y + 20 * env.S;
    },
    properties: [
        { key: 'x', label: 'X', type: 'number' },
        { key: 'y', label: 'Y', type: 'number' },
        { key: 'size', label: '大小', type: 'number', step: 0.1, min: 0.3, max: 2 },
        { key: 'tipType', label: '轴尖', type: 'select',
            options: [{ value: 'sharp', label: '尖' }, { value: 'round', label: '圆' }, { value: 'flat', label: '平' }] },
        { key: 'comFrac', label: '重心', type: 'range', min: 10, max: 90, scale: 100 },
        { key: 'massDist', label: '质量', type: 'select',
            options: [{ value: 'center', label: '靠中心' }, { value: 'uniform', label: '均匀' }, { value: 'edge', label: '靠边缘' }] },
        { key: 'color', label: '颜色', type: 'color' }
    ],
    render: {
        main(el, scene, env) {
            const c = env.ctx;
            const state = { spinPhase: el._spinPhase || 0, tilt: el._tilt || 0, fallProgress: el._fallProgress || 0 };
            const shA = 1 - state.fallProgress * 0.55;
            const gr = c.createRadialGradient(el.x, el.y, 0, el.x, el.y, 140 * env.S * (el.size || 1));
            gr.addColorStop(0, `rgba(0,0,0,${0.5 * shA})`);
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gr;
            c.beginPath();
            c.ellipse(el.x, el.y, 140 * env.S * (el.size || 1), 22 * env.S * (el.size || 1), 0, 0, Math.PI * 2);
            c.fill();
            drawTopRealistic(c, el, env, state);
            if (el.startTime != null) {
                c.save();
                c.font = `bold ${11 * env.S}px system-ui, sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                const tau = el._tau || 0;
                const done = state.fallProgress > 0.85;
                const label = done ? '已倒下' : `${(el._vel || 1).toFixed(2)}x · ${tau.toFixed(1)}s`;
                const bw = 74 * env.S, bh = 20 * env.S;
                const bx = el.x - bw / 2, by = el.y + 22 * env.S;
                c.fillStyle = done ? 'rgba(255,122,107,0.25)' : 'rgba(0,0,0,0.45)';
                roundRectPath(c, bx, by, bw, bh, 10 * env.S);
                c.fill();
                c.strokeStyle = done ? 'rgba(255,122,107,0.7)' : 'rgba(94,179,255,0.4)';
                c.lineWidth = 1 * env.S;
                roundRectPath(c, bx, by, bw, bh, 10 * env.S);
                c.stroke();
                c.fillStyle = done ? '#ff9aa8' : '#cfe0f7';
                c.fillText(label, el.x, by + bh / 2 + 1);
                c.restore();
            }
        }
    }
};

/* ============================================================
   分类（含 other 兜底）
   ============================================================ */
const Categories = {
    mechanical: { label: '机械', icon: '⚙️' },
    optical:    { label: '光学', icon: '💧' },
    other:      { label: '其他', icon: '📦' }
};
function getComponentsByCategory(cat) {
    return Object.entries(ComponentTypes)
        .filter(([k, v]) => v.category === cat)
        .map(([type, def]) => ({ type, ...def }));
}

/* ============================================================
   系统
   ============================================================ */
const Systems = {};
Systems.gearMesh = {
    update(scene, dt, env) {
        const gears = scene.elements.filter(e => e.type === 'gear');
        if (!gears.length) return;
        for (const g of gears) { g._omega = 0; g._meshParent = null; }
        const driver = gears.find(g => g.isDriver);
        if (!driver) return;
        driver._omega = driver.speed;
        const queue = [driver];
        const visited = new Set([driver.id]);
        const tol = 20 * env.S;
        while (queue.length) {
            const g = queue.shift();
            const gr = env.MODULE * g.teeth / 2;
            for (const o of gears) {
                if (visited.has(o.id)) continue;
                const or = env.MODULE * o.teeth / 2;
                if (Math.abs(Math.hypot(o.x - g.x, o.y - g.y) - (gr + or)) > tol) continue;
                o._meshParent = g;
                o._omega = -g._omega * g.teeth / o.teeth;
                visited.add(o.id);
                queue.push(o);
                Audio.clack();
            }
        }
        for (const g of gears) g.angle += g._omega * dt;
    }
};
Systems.topSpin = {
    update(scene, dt, env) {
        for (const el of scene.elements) {
            if (el.type !== 'top') continue;
            const cfg = topConfig(el);
            if (el.startTime == null) {
                el._tau = 0; el._spinPhase = 0; el._vel = 1; el._tilt = 0; el._fallProgress = 0;
                continue;
            }
            const tau = Math.max(0, scene.time - el.startTime);
            const state = getTopState(tau, cfg);
            el._tau = tau;
            el._spinPhase = state.spinPhase;
            el._vel = state.vel;
            el._tilt = state.tilt;
            el._fallProgress = state.fallProgress;
        }
    }
};

/* ============================================================
   插件系统：从文件导入组件
   ============================================================ */
const PLUGIN_STORAGE_KEY = 'physlab_plugins_v1';

function validateComponentDef(def) {
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

function registerComponent(def, code, sourceName, opts) {
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
function unregisterComponent(type, silent) {
    const def = ComponentTypes[type];
    if (!def || !def.__external) return;
    delete ComponentTypes[type];
    delete Systems['__plugin_' + type];
    for (const scene of Scenes) {
        scene.elements = scene.elements.filter(e => e.type !== type);
    }
    if (selectedId) {
        const cur = getCurrentScene();
        if (cur && !cur.elements.find(e => e.id === selectedId)) selectedId = null;
    }
    savePluginsToStorage();
    renderPanel();
    renderSceneTabs();
    if (!silent) showTip(`已移除组件「${def.label}」`);
}

function loadComponentFromCode(code, sourceName, opts) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('代码为空');
    let def;
    try {
        const factory = new Function(`"use strict"; return (${code});`);
        def = factory();
        if (typeof def === 'function') def = def();
    } catch (e1) {
        try {
            const factory = new Function(`"use strict";\n${code}\n;return typeof component !== 'undefined' ? component : undefined;`);
            def = factory();
        } catch (e2) {
            throw new Error('解析失败：' + e2.message);
        }
    }
    if (!def || typeof def !== 'object') throw new Error('文件没有返回有效的组件定义');
    validateComponentDef(def);
    registerComponent(def, code, sourceName, opts);
    renderPanel();
    renderSceneTabs();
    if (!(opts && opts.silent)) showTip(`已加载组件「${def.label}」`);
    return def;
}

/* ============================================================
   启动时自动加载 js/components/*.js
   ============================================================ */
const COMPONENTS_DIR = 'js/components';

async function loadAutoComponents() {
    let files;
    try {
        const res = await fetch(`${COMPONENTS_DIR}/manifest.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        files = await res.json();
    } catch (e) {
        console.warn(`[自动加载] 跳过：无法读取 ${COMPONENTS_DIR}/manifest.json（${e.message}）。若以 file:// 打开本页，请改用 HTTP 服务器访问。`);
        return;
    }
    if (!Array.isArray(files)) return;
    let ok = 0; const failed = [];
    for (const name of files) {
        try {
            const res = await fetch(`${COMPONENTS_DIR}/${name}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const code = await res.text();
            loadComponentFromCode(code, name, { silent: true, overwrite: true });
            ok++;
        } catch (err) {
            failed.push(name);
            console.warn('[自动加载] 部件加载失败:', name, err);
        }
    }
    renderPanel();
    renderSceneTabs();
    if (ok) showTip(`已自动加载 ${ok} 个组件${failed.length ? `，${failed.length} 个失败：${failed.join('、')}` : ''}`);
    else if (failed.length) showTip('组件自动加载失败：' + failed.join('、'), true);
}

function savePluginsToStorage() {
    const list = [];
    for (const type in ComponentTypes) {
        const def = ComponentTypes[type];
        if (def.__external && def.__code) list.push({ type, code: def.__code, source: def.__source });
    }
    try { localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}

function loadPersistedPlugins() {
    try {
        const raw = localStorage.getItem(PLUGIN_STORAGE_KEY);
        if (!raw) return;
        for (const item of JSON.parse(raw)) {
            try { loadComponentFromCode(item.code, item.source); }
            catch (e) { console.warn('插件恢复失败：', item.type, e.message); }
        }
    } catch (e) {}
}

/* ============================================================
   场景管理
   ============================================================ */
const Scenes = [];
let currentSceneId = null;

function createScene(opts) {
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
function getCurrentScene() { return Scenes.find(s => s.id === currentSceneId) || null; }
function addElement(scene, type, x, y) {
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
        else if (def.onPlace) def.onPlace(el, x, y, buildEnv(scene));
    }
    if (type === 'top') el.startTime = scene.time;
    scene.elements.push(el);
    return el;
}

/* ============================================================
   预置场景
   ============================================================ */
function createGearScene() {
    const scene = createScene({ name: '齿轮转啊转', icon: '⚙️' });
    const g1 = addElement(scene, 'gear', W * 0.3, H * 0.4);
    Object.assign(g1, { teeth: 12, color: '#5eb3ff', isDriver: true, speed: 0.9, draggable: false });
    const g2 = addElement(scene, 'gear', W * 0.3 + 130, H * 0.75);
    Object.assign(g2, { teeth: 20, color: '#7fdd6e' });
    const g3 = addElement(scene, 'gear', W * 0.65, H * 0.75);
    Object.assign(g3, { teeth: 16, color: '#ffb055' });
    return scene;
}
function createRefractionScene() {
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
function createTopScene() {
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

/* ============================================================
   渲染
   ============================================================ */
function buildEnv(scene) {
    return { ctx, W, H, S, MODULE: 8.5 * S, time, scene, selectedId };
}
function drawBackground(scene, env) {
    const c = env.ctx;
    const g = c.createLinearGradient(0, 0, 0, H);
    if (scene.background === 'dark') {
        g.addColorStop(0, '#1a2438'); g.addColorStop(0.55, '#0d1422'); g.addColorStop(1, '#050810');
    } else {
        g.addColorStop(0, '#10142a'); g.addColorStop(1, '#080a16');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const ty = H * 0.85;
    const tg = c.createLinearGradient(0, ty, 0, H);
    tg.addColorStop(0, 'rgba(74, 48, 32, 0.35)');
    tg.addColorStop(1, 'rgba(21, 12, 5, 0)');
    c.fillStyle = tg;
    c.fillRect(0, ty, W, H - ty);
    c.strokeStyle = 'rgba(120, 160, 240, 0.03)';
    c.lineWidth = 1;
    const step = 60 * S;
    for (let x = 0; x < W; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}
function drawLightRays(scene, env) {
    if (!scene.showRays) return;
    const c = env.ctx;
    const eyes = scene.elements.filter(e => e.type === 'eye');
    if (!eyes.length) return;
    const eye = eyes[0];
    const drawRay = (fromX, fromY, toEyeX, toEyeY, waterY, cup) => {
        const hitX = clamp((fromX + toEyeX) / 2, cup.x + 6 * env.S, cup.x + cup.w - 6 * env.S);
        c.save();
        c.strokeStyle = 'rgba(255, 213, 79, 0.75)';
        c.lineWidth = 1.5 * env.S;
        c.beginPath(); c.moveTo(fromX, fromY); c.lineTo(hitX, waterY); c.stroke();
        c.beginPath(); c.moveTo(hitX, waterY); c.lineTo(toEyeX, toEyeY); c.stroke();
        c.beginPath(); c.arc(hitX, waterY, 3.5 * env.S, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,213,79,1)'; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.2 * env.S; c.stroke();
        c.restore();
    };
    for (const coin of scene.elements.filter(e => e.type === 'coin')) {
        let cup = null;
        for (const o of scene.elements) {
            if (o.type === 'cup' && coin.x >= o.x && coin.x <= o.x + o.w && coin.y >= o.y && coin.y <= o.y + o.h) { cup = o; break; }
        }
        if (!cup || cup.waterLevel <= 0.01) continue;
        const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
        if (coin.y <= waterY) continue;
        drawRay(coin.x, coin.y, eye.x, eye.y, waterY, cup);
    }
    for (const s of scene.elements.filter(e => e.type === 'stick')) {
        let cup = null;
        for (const o of scene.elements) {
            if (o.type !== 'cup' || o.waterLevel < 0.01) continue;
            const waterY = o.y + o.h * (1 - o.waterLevel * 0.92);
            if (Math.max(s.y1, s.y2) <= waterY) continue;
            const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
            if (xMax < o.x || xMin > o.x + o.w) continue;
            cup = o; break;
        }
        if (!cup) continue;
        const waterY = cup.y + cup.h * (1 - cup.waterLevel * 0.92);
        const dy = s.y2 - s.y1;
        if (Math.abs(dy) < 0.001) continue;
        const tWater = clamp((waterY - s.y1) / dy, 0, 1);
        if (tWater >= 1) continue;
        const midT = (tWater + 1) / 2;
        const px = s.x1 + (s.x2 - s.x1) * midT;
        const py = s.y1 + (s.y2 - s.y1) * midT;
        drawRay(px, py, eye.x, eye.y, waterY, cup);
    }
}
function drawSelection(scene, env) {
    const el = scene.elements.find(e => e.id === selectedId);
    if (!el) return;
    const def = ComponentTypes[el.type];
    if (!def) return;
    const c = env.ctx;
    c.save();
    c.strokeStyle = 'rgba(94, 179, 255, 0.9)';
    c.lineWidth = 2 * env.S;
    c.setLineDash([6 * env.S, 4 * env.S]);
    c.lineDashOffset = -env.time * 25;
    if (el.type === 'stick') {
        c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke();
    } else if (el.type === 'cup') {
        c.strokeRect(el.x - 6 * env.S, el.y - 6 * env.S, el.w + 12 * env.S, el.h + 12 * env.S);
    } else if (el.type === 'top') {
        const w = 200 * env.S * (el.size || 1);
        const h = 310 * env.S * (el.size || 1);
        c.strokeRect(el.x - w / 2, el.y - h, w, h);
    } else {
        const r = def.getRadius(el, env) + 8 * env.S;
        const pos = def.getPosition(el);
        c.beginPath(); c.arc(pos.x, pos.y, r, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    const handles = def.getHandles ? def.getHandles(el, env) : [];
    if (handles.length) {
        c.save();
        c.fillStyle = '#5eb3ff'; c.strokeStyle = '#fff'; c.lineWidth = 2 * env.S;
        for (const h of handles) {
            c.beginPath(); c.arc(h.x, h.y, 7 * env.S, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        c.restore();
    }
}
function drawStatusText(scene, env) {
    const c = env.ctx;
    const count = scene.elements.length;
    let text;
    if (!count) text = '点击上方组件库添加部件';
    else if (selectedId) text = '拖动移动 · 面板编辑属性';
    else text = `${count} 个部件 · 点击选择`;
    c.save();
    c.font = `bold ${13 * S}px system-ui, sans-serif`;
    const tw = c.measureText(text).width;
    const padX = 14 * S, bh = 30 * S, bw = tw + padX * 2;
    const bx = 16 * S, by = 16 * S;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    roundRectPath(c, bx, by, bw, bh, bh / 2);
    c.fill();
    c.fillStyle = '#cfe0f7';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, bx + padX, by + bh / 2 + 1);
    c.restore();
}
function drawMissingPlaceholder(el, env) {
    const c = env.ctx;
    const x = el.x ?? el.x1 ?? 0;
    const y = el.y ?? el.y1 ?? 0;
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,110,130,.15)';
    c.strokeStyle = 'rgba(255,110,130,.7)';
    c.lineWidth = 2 * env.S;
    c.setLineDash([6 * env.S, 4 * env.S]);
    c.beginPath(); c.rect(-40 * env.S, -40 * env.S, 80 * env.S, 80 * env.S); c.fill(); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,180,190,.9)';
    c.font = `bold ${12 * env.S}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('缺失', 0, -8 * env.S);
    c.font = `${10 * env.S}px system-ui, sans-serif`;
    c.fillText(el.type, 0, 10 * env.S);
    c.restore();
}
function renderScene(scene) {
    if (!scene) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H); return; }
    const env = buildEnv(scene);
    ctx.clearRect(0, 0, W, H);
    drawBackground(scene, env);
    drawLightRays(scene, env);
    const phases = ['back', 'main', 'front'];
    for (const phase of phases) {
        for (const el of scene.elements) {
            if (el.__missing) { if (phase === 'main') drawMissingPlaceholder(el, env); continue; }
            const def = ComponentTypes[el.type];
            if (def && def.render && def.render[phase]) def.render[phase](el, scene, env);
        }
    }
    drawSelection(scene, env);
    drawStatusText(scene, env);
}

/* ============================================================
   交互
   ============================================================ */
let selectedId = null;
let dragging = null;
let draggingHandle = null;
let dragStart = null;
let activePointer = null;
let placingType = null;

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function hitTest(scene, p, env) {
    for (let i = scene.elements.length - 1; i >= 0; i--) {
        const el = scene.elements[i];
        if (el.__missing) continue;
        const def = ComponentTypes[el.type];
        if (!def) continue;
        if (def.hitTest) { if (def.hitTest(el, p, env)) return el; }
        else { if (dist(p, def.getPosition(el)) < def.getRadius(el, env)) return el; }
    }
    return null;
}
function hitHandle(scene, el, p, env) {
    if (!el) return null;
    const def = ComponentTypes[el.type];
    if (!def || !def.getHandles) return null;
    const handles = def.getHandles(el, env);
    for (const h of handles) if (dist(p, h) < 14 * env.S) return { el, handle: h };
    return null;
}
function onPointerDown(e) {
    Audio.init();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    const scene = getCurrentScene();
    if (!scene) return;
    const p = getPos(e);
    const env = buildEnv(scene);
    if (placingType) {
        const el = addElement(scene, placingType, p.x, p.y);
        if (el) {
            selectedId = el.id;
            placingType = null;
            canvas.style.cursor = 'default';
            Audio.add();
            renderPanel();
            showTip(`已添加 ${ComponentTypes[el.type].label}`);
        }
        return;
    }
    if (selectedId) {
        const sel = scene.elements.find(x => x.id === selectedId);
        if (sel) {
            const hh = hitHandle(scene, sel, p, env);
            if (hh) { draggingHandle = hh.handle; dragging = sel; return; }
        }
    }
    const hit = hitTest(scene, p, env);
    if (hit) {
        selectedId = hit.id;
        dragging = hit;
        const def = ComponentTypes[hit.type];
        const pos = def.getPosition(hit);
        dragStart = { startX: p.x, startY: p.y, origX: pos.x, origY: pos.y };
        Audio.grab();
        renderPanel();
    } else {
        selectedId = null;
        dragging = null;
        renderPanel();
    }
}
function onPointerMove(e) {
    if (activePointer !== e.pointerId || !dragging) return;
    const p = getPos(e);
    const scene = getCurrentScene();
    if (!scene) return;
    const def = ComponentTypes[dragging.type];
    const env = buildEnv(scene);
    if (draggingHandle) {
        if (def.onHandleDrag) def.onHandleDrag(dragging, draggingHandle.id, p, env);
        syncPositionInputs();
        return;
    }
    const dx = p.x - dragStart.startX;
    const dy = p.y - dragStart.startY;
    def.setPosition(dragging, dragStart.origX + dx, dragStart.origY + dy);
    syncPositionInputs();
}
function onPointerUp(e) {
    if (activePointer !== e.pointerId) return;
    activePointer = null;
    if (dragging && !draggingHandle && dragStart) {
        const p = getPos(e);
        if (Math.hypot(p.x - dragStart.startX, p.y - dragStart.startY) < 6) {
            const scene = getCurrentScene();
            const def = ComponentTypes[dragging.type];
            if (scene && def && def.onTap) def.onTap(dragging, scene, buildEnv(scene));
        }
    }
    if (dragging) Audio.drop();
    dragging = null;
    draggingHandle = null;
    dragStart = null;
}

/* ============================================================
   面板 UI
   ============================================================ */
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function renderPanel() {
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
        scene.elements = []; selectedId = null; Audio.click(); renderPanel();
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
            placingType = placingType === type ? null : type;
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
            selectedId = chip.dataset.eid;
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

function syncPositionInputs() {
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
function duplicateSelected() {
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
    selectedId = copy.id;
    Audio.add();
    renderPanel();
    showTip('已复制');
}
function deleteSelected() {
    const scene = getCurrentScene();
    if (!scene || !selectedId) return;
    scene.elements = scene.elements.filter(e => e.id !== selectedId);
    selectedId = null;
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

/* ============================================================
   序列化
   ============================================================ */
function serializeElement(el) {
    const copy = JSON.parse(JSON.stringify(el));
    delete copy.id; delete copy.__missing;
    delete copy._omega; delete copy._meshParent;
    delete copy._spinPhase; delete copy._vel; delete copy._tilt; delete copy._fallProgress; delete copy._tau;
    return copy;
}
function serializeScene(scene) {
    return {
        name: scene.name, icon: scene.icon, background: scene.background,
        showRays: scene.showRays,
        elements: scene.elements.map(serializeElement),
        requiredComponents: Array.from(new Set(scene.elements.map(e => e.type)))
    };
}
function deserializeElement(raw) {
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
function deserializeScene(raw) {
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

function importData(data) {
    if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象');
    const t = data.type;
    if (t === 'workspace' && Array.isArray(data.scenes)) {
        if (!data.scenes.length) throw new Error('工作区里没有实验');
        if (Scenes.length && !confirm(`导入 ${data.scenes.length} 个实验，替换当前所有？`)) return;
        Scenes.length = 0;
        for (const raw of data.scenes) Scenes.push(deserializeScene(raw));
        switchToScene(Scenes[0].id);
        showTip(`已导入 ${Scenes.length} 个实验`);
        return;
    }
    if (t === 'scene' && data.scene) {
        const s = deserializeScene(data.scene);
        Scenes.push(s); switchToScene(s.id);
        showTip(`已导入实验「${s.name}」`);
        return;
    }
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
        selectedId = el.id;
        renderPanel();
        showTip(`已导入 ${ComponentTypes[el.type].label}`);
        return;
    }
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
    if (t === 'refraction-scene' || Array.isArray(data.elements)) {
        const scene = createScene({ name: '导入的折射场景', icon: '💧' });
        const arr = Array.isArray(data.elements) ? data.elements : [data];
        for (const raw of arr) { const el = deserializeElement(raw); if (el) scene.elements.push(el); }
        Scenes.push(scene); switchToScene(scene.id);
        showTip('已导入折射场景');
        return;
    }
    if (t === 'refraction-element' && data.element) {
        const el = deserializeElement(data.element);
        if (!el) throw new Error('无法识别的部件');
        const scene = getCurrentScene();
        if (!scene) throw new Error('请先选择一个实验');
        scene.elements.push(el); selectedId = el.id; renderPanel();
        showTip('已导入部件');
        return;
    }
    throw new Error('无法识别格式');
}

/* ============================================================
   场景切换
   ============================================================ */
function renderSceneTabs() {
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
function switchToScene(id) {
    if (!Scenes.find(s => s.id === id)) return;
    currentSceneId = id;
    selectedId = null;
    dragging = null;
    draggingHandle = null;
    placingType = null;
    canvas.style.cursor = 'default';
    renderSceneTabs();
    renderPanel();
}
function createNewScene() {
    const name = prompt('给这个新实验起个名字：', '我的实验');
    if (name === null) return;
    const scene = createScene({ name: name.trim() || '未命名实验', icon: '🧪' });
    Scenes.push(scene);
    switchToScene(scene.id);
    showTip('新实验已创建，从组件库添加部件吧');
}

/* ============================================================
   工具
   ============================================================ */
function showTip(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(showTip._t);
    showTip._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
function downloadJSON(filename, obj) {
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
function resize() {
    const rect = stage.getBoundingClientRect();
    const oldW = W, oldH = H;
    W = Math.max(240, rect.width);
    H = Math.max(240, rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = clamp(H / 800, 0.55, 1.15);
    if (oldW > 0 && oldH > 0 && (oldW !== W || oldH !== H)) {
        const sx = W / oldW, sy = H / oldH;
        for (const scene of Scenes) {
            for (const el of scene.elements) {
                if (el.x != null) { el.x *= sx; el.y *= sy; }
                if (el.x1 != null) { el.x1 *= sx; el.y1 *= sy; el.x2 *= sx; el.y2 *= sy; }
                if (el.w != null) { el.w *= sx; el.h *= sy; }
                if (el.r != null) { el.r *= sx; }
                const def = ComponentTypes[el.type];
                if (def && def.scale) def.scale(el, sx, sy);
            }
        }
    }
}
function initDefaultScenes() {
    Scenes.length = 0;
    Scenes.push(createGearScene());
    Scenes.push(createRefractionScene());
    Scenes.push(createTopScene());
    currentSceneId = Scenes[0].id;
    selectedId = null;
    renderSceneTabs();
    renderPanel();
}

/* ============================================================
   主循环
   ============================================================ */
let lastT = 0;
function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(t - lastT, 50) / 1000;
    lastT = t;
    time += dt;
    const scene = getCurrentScene();
    if (scene) {
        scene.time += dt;
        const env = buildEnv(scene);
        for (const sysKey in Systems) {
            if (Systems[sysKey].update) Systems[sysKey].update(scene, dt, env);
        }
        updateHUD(scene);
    } else {
        updateHUD(null);
    }
    renderScene(scene);
    requestAnimationFrame(loop);
}
function updateHUD(scene) {
    if (!scene) { hudEl.innerHTML = ''; return; }
    const tops = scene.elements.filter(e => e.type === 'top' && e.startTime != null);
    if (!tops.length) { hudEl.innerHTML = ''; return; }
    hudEl.innerHTML = tops.map((el, i) => {
        const tau = el._tau || 0;
        const done = (el._fallProgress || 0) > 0.85;
        const tip = { sharp: '尖', round: '圆', flat: '平' }[el.tipType] || '';
        const mass = { center: '中', uniform: '匀', edge: '边' }[el.massDist] || '';
        const status = done ? '💤 已倒下' : `${(el._vel || 1).toFixed(2)}x · ${tau.toFixed(1)}s`;
        return `<div class="hud-item">陀螺${i + 1}｜重心${Math.round(el.comFrac * 100)}% 轴${tip} 质量${mass}｜${status}</div>`;
    }).join('');
}

/* ============================================================
   事件
   ============================================================ */
function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', e => e.preventDefault());
    document.getElementById('btnNewScene').onclick = createNewScene;
    document.getElementById('panelToggle').onclick = () => {
        panel.classList.toggle('collapsed');
        document.getElementById('panelToggle').textContent = panel.classList.contains('collapsed') ? '»' : '«';
        requestAnimationFrame(resize);
    };
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(stage);
    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
        if (e.key === 'Escape') { placingType = null; canvas.style.cursor = 'default'; selectedId = null; renderPanel(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    });
    // 拖拽 .js 文件直接导入组件
    stage.addEventListener('dragover', e => e.preventDefault());
    stage.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!/\.js$/i.test(file.name)) {
            showTip('只支持 .js 组件文件（场景仍用 .json）', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try { loadComponentFromCode(String(reader.result), file.name); }
            catch (err) { showTip('加载失败：' + err.message, true); }
        };
        reader.readAsText(file);
    });
}