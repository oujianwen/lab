/* ============================================================
   内置组件：齿轮 / 杯子 / 木棍 / 硬币 / 眼睛 / 光源 / 陀螺
   ============================================================ */
import { ComponentTypes } from '../engine/registry.js';
import { dist, distToSegment, mixHex, hexA, roundRectPath, clamp } from '../core/math.js';
import { S } from '../core/state.js';
import { topConfig, getTopState } from './systems.js';

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