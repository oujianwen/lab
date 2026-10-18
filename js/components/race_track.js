(function () {
    function parseColor(hex) {
        let s = (hex || '#7fbf6a').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 127, g: 191, b: 106 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mix(hex, target, t) {
        const A = parseColor(hex), B = parseColor(target);
        return '#' + ['r', 'g', 'b'].map(k =>
            Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
    }

    // 三次贝塞尔
    function bez3(t, a, c1, c2, b) { const it = 1 - t; return it * it * it * a + 3 * it * it * t * c1 + 3 * it * t * t * c2 + t * t * t * b; }
    function dbez(t, a, c1, c2, b) { const it = 1 - t; return 3 * it * it * (c1 - a) + 6 * it * t * (c2 - c1) + 3 * t * t * (b - c2); }
    // 曲线在参数 t、法向偏移 lateral 处的点
    function lanePoint(el, t, lateral) {
        const x = bez3(t, el.sx, el.c1x, el.c2x, el.fx);
        const y = bez3(t, el.sy, el.c1y, el.c2y, el.fy);
        const dx = dbez(t, el.sx, el.c1x, el.c2x, el.fx);
        const dy = dbez(t, el.sy, el.c1y, el.c2y, el.fy);
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;   // 单位法向
        return { x: x + nx * lateral, y: y + ny * lateral, nx, ny };
    }
    function lanePts(el, lateral, steps) {
        const out = [];
        for (let i = 0; i <= steps; i++) out.push(lanePoint(el, i / steps, lateral));
        return out;
    }
    function tracePath(c, pts) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y);
    }

    // 依据形状用当前起点/终点重算控制点
    function applyShape(el, shape) {
        const dx = el.fx - el.sx, dy = el.fy - el.sy;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const bend = L * 0.28;
        const p1x = el.sx + dx / 3, p1y = el.sy + dy / 3;
        const p2x = el.sx + dx * 2 / 3, p2y = el.sy + dy * 2 / 3;
        if (shape === 'straight') { el.c1x = p1x; el.c1y = p1y; el.c2x = p2x; el.c2y = p2y; }
        else if (shape === 's') {
            el.c1x = p1x + nx * bend; el.c1y = p1y + ny * bend;
            el.c2x = p2x - nx * bend; el.c2y = p2y - ny * bend;
        } else { // bend 弧形
            el.c1x = p1x + nx * bend; el.c1y = p1y + ny * bend;
            el.c2x = p2x + nx * bend; el.c2y = p2y + ny * bend;
        }
        el.shape = shape;
    }

    return {
        type: 'race_track',
        label: '跑道',
        icon: '🏁',
        category: 'other',
        color: '#7fbf6a',

        defaults() {
            const w = (typeof W !== 'undefined' && W) ? W : 800;
            const h = (typeof H !== 'undefined' && H) ? H : 600;
            const el = {
                sx: w * 0.16, sy: h * 0.66, fx: w * 0.84, fy: h * 0.66,
                c1x: w * 0.38, c1y: h * 0.42, c2x: w * 0.62, c2y: h * 0.42,
                shape: 'bend', lanes: 2, laneGap: 46,
                started: false, vTort: 0.075, vHare: 0.45, sleepAt: 0.7, sleepTime: 12,
                color: '#7fbf6a', _timer: 0, _winner: null, _wasStarted: false
            };
            return el;
        },

        onPlace(el, x, y, env) {
            const S = (env && env.S) || 1;
            const len = Math.min(env.W * 0.72, 820 * S);
            el.sx = x - len / 2; el.sy = y; el.fx = x + len / 2; el.fy = y;
            applyShape(el, el.shape || 'bend');
        },
        scale(el, sx, sy) {
            el.sx *= sx; el.sy *= sy; el.fx *= sx; el.fy *= sy;
            el.c1x *= sx; el.c1y *= sy; el.c2x *= sx; el.c2y *= sy;
        },
        getPosition(el) { return lanePoint(el, 0.5, 0); },
        setPosition(el, x, y) {
            const p = this.getPosition(el);
            const dx = x - p.x, dy = y - p.y;
            el.sx += dx; el.sy += dy; el.fx += dx; el.fy += dy;
            el.c1x += dx; el.c1y += dy; el.c2x += dx; el.c2y += dy;
        },
        getRadius(el, env) { return Math.hypot(el.fx - el.sx, el.fy - el.sy) / 2 + el.lanes * el.laneGap + 80 * env.S; },
        hitTest(el, p, env) {
            const halfW = el.lanes * el.laneGap / 2 + 14 * env.S;
            const pts = lanePts(el, 0, 24);
            for (const q of pts) if (Math.hypot(p.x - q.x, p.y - q.y) < halfW) return true;
            return false;
        },
        getHandles(el) {
            return [
                { id: 'start', x: el.sx, y: el.sy },
                { id: 'c1', x: el.c1x, y: el.c1y },
                { id: 'c2', x: el.c2x, y: el.c2y },
                { id: 'finish', x: el.fx, y: el.fy }
            ];
        },
        onHandleDrag(el, handleId, p) {
            if (handleId === 'start') { el.sx = p.x; el.sy = p.y; }
            else if (handleId === 'finish') { el.fx = p.x; el.fy = p.y; }
            else if (handleId === 'c1') { el.c1x = p.x; el.c1y = p.y; }
            else if (handleId === 'c2') { el.c2x = p.x; el.c2y = p.y; }
            el.shape = 'custom';   // 手动调过曲线后不再被形状预设覆盖
        },

        properties: [
            { key: 'shape', label: '路线形状', type: 'select',
                options: [
                    { value: 'straight', label: '直线' },
                    { value: 'bend', label: '弧形' },
                    { value: 's', label: 'S 形' },
                    { value: 'custom', label: '自定义（拖拽控制点）' }
                ] },
            { key: 'lanes', label: '跑道道数', type: 'number', step: 1, min: 1, max: 6 },
            { key: 'laneGap', label: '道宽', type: 'number', step: 2, min: 24, max: 90 },
            { key: 'started', label: '开始比赛', type: 'checkbox' },
            { key: 'vTort', label: '乌龟速度', type: 'number', step: 0.01, min: 0.02, max: 0.5 },
            { key: 'vHare', label: '兔子速度', type: 'number', step: 0.01, min: 0.05, max: 0.8 },
            { key: 'sleepAt', label: '兔子睡觉点', type: 'range', min: 20, max: 90, scale: 100 },
            { key: 'sleepTime', label: '睡觉时长(秒)', type: 'number', step: 0.5, min: 0, max: 30 },
            { key: 'color', label: '草地颜色', type: 'color' }
        ],

        onPropertyChange(el, key, value) {
            if (key === 'shape' && value !== 'custom') applyShape(el, value);
        },

        onTap(el) { el.started = !el.started; },

        render: {
            main(el, scene, env) {
                step(el, scene, env);
                drawTrack(el, scene, env);
            }
        }
    };

    // ===== 比赛推进 =====
    function step(el, scene, env) {
        const dt = env.lastDt || 0.016;
        const runners = scene.elements.filter(e => (e.type === 'turtle' || e.type === 'rabbit') && !e.__missing);
        const n = runners.length;

        if (el.started && !el._wasStarted) {
            el._wasStarted = true; el._timer = 0; el._winner = null;
            for (const r of runners) { r._progress = 0; r._slept = false; r._sleepLeft = (el.sleepTime || 0); r._state = 'idle'; }
        }
        if (!el.started) el._wasStarted = false;
        if (el.started && !el._winner) el._timer += dt;

        runners.forEach((r, i) => {
            if (r._progress == null) r._progress = 0;
            const lateral = (i - (n - 1) / 2) * el.laneGap;
            if (!el.started) {
                r._state = 'idle'; r._progress = 0;
            } else if (el._winner) {
                r._state = r._progress >= 1 ? 'done' : 'stopped';
            } else if (r._progress < 1) {
                if (r.type === 'rabbit') {
                    if (r._state !== 'sleep' && !r._slept && r._progress >= (el.sleepAt || 0.7)) {
                        r._slept = true; r._state = 'sleep'; r._sleepLeft = (el.sleepTime || 0);
                    }
                    if (r._state === 'sleep') {
                        r._sleepLeft -= dt; if (r._sleepLeft <= 0) r._state = 'run';
                    } else { r._state = 'run'; r._progress += el.vHare * dt; }
                } else { r._state = 'run'; r._progress += el.vTort * dt; }
                if (r._progress >= 1) { r._progress = 1; r._state = 'done'; if (!el._winner) el._winner = r; }
            }
            const pos = lanePoint(el, Math.max(0, Math.min(1, r._progress)), lateral);
            r.x = pos.x; r.y = pos.y;
        });
    }

    // ===== 绘制 =====
    function drawTrack(el, scene, env) {
        const c = env.ctx, S = env.S;
        const lanes = Math.max(1, Math.round(el.lanes || 1));
        const gap = el.laneGap || 46;
        const halfW = lanes * gap / 2;

        c.save();
        // 草地跑道带
        tracePath(c, lanePts(el, 0, 60));
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = mix(el.color, '#000000', 0.15);
        c.lineWidth = lanes * gap + 26 * S;
        c.stroke();
        tracePath(c, lanePts(el, 0, 60));
        c.strokeStyle = el.color;
        c.lineWidth = lanes * gap;
        c.stroke();

        // 道次分隔线
        c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.5 * S;
        c.setLineDash([10 * S, 8 * S]);
        for (let k = 1; k < lanes; k++) {
            tracePath(c, lanePts(el, (k - lanes / 2) * gap, 48));
            c.stroke();
        }
        c.setLineDash([]);

        // 跑道内外沿
        c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2 * S;
        tracePath(c, lanePts(el, halfW, 48)); c.stroke();
        tracePath(c, lanePts(el, -halfW, 48)); c.stroke();

        // 起点线
        const a0 = lanePoint(el, 0, -halfW), a1 = lanePoint(el, 0, halfW);
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4 * S;
        c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(a1.x, a1.y); c.stroke();

        // 终点黑白格
        const f = lanePoint(el, 1, 0);
        const ang = Math.atan2(f.ny, f.nx);
        c.save();
        c.translate(f.x, f.y); c.rotate(ang);
        const across = lanes * gap, cols = 8, cellW = across / cols, rows = 2, cellH = 9 * S;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                c.fillStyle = (row + col) % 2 ? '#141414' : '#f5f5f5';
                c.fillRect(-across / 2 + col * cellW, -cellH + row * cellH, cellW, cellH);
            }
        }
        c.restore();
        c.restore();

        // HUD / 提示横幅（曲线中点上方）
        const mid = lanePoint(el, 0.5, 0);
        c.save();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        if (!el.started) banner(c, '拖拽手柄改长度/弯曲 · 点赛道起跑', mid.x, mid.y - halfW - 22 * S, S);
        else if (el._winner) {
            const isTort = el._winner.type === 'turtle';
            banner(c, `${isTort ? '🐢 乌龟' : '🐰 兔子'}获胜！用时 ${el._timer.toFixed(1)}s`, mid.x, mid.y - halfW - 22 * S, S, isTort ? '#7fdd6e' : '#ffb055');
        } else banner(c, `⏱ ${el._timer.toFixed(1)}s`, mid.x, mid.y - halfW - 22 * S, S);
        c.restore();
    }

    function banner(c, text, cx, cy, S, color) {
        c.font = `bold ${13 * S}px system-ui, sans-serif`;
        const tw = c.measureText(text).width;
        const bw = tw + 22 * S, bh = 24 * S;
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.beginPath();
        if (c.roundRect) c.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 12 * S); else c.rect(cx - bw / 2, cy - bh / 2, bw, bh);
        c.fill();
        c.fillStyle = color || '#cfe0f7';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, cx, cy + 1);
    }
})()