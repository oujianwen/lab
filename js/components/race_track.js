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

    // ---- Catmull-Rom 采样 + 弧长参数化 ----
    function cr(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return {
            x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        };
    }
    function buildPath(el) {
        const P = el.pts, n = P.length;
        const get = i => P[Math.max(0, Math.min(n - 1, i))];
        const samples = [];
        const SUB = 24;
        for (let i = 0; i < n - 1; i++) {
            const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
            for (let j = 0; j < SUB; j++) samples.push(cr(p0, p1, p2, p3, j / SUB));
        }
        samples.push({ x: P[n - 1].x, y: P[n - 1].y });
        const cum = [0]; let acc = 0;
        for (let i = 1; i < samples.length; i++) {
            acc += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
            cum.push(acc);
        }
        const len = samples.length;
        for (let i = 0; i < len; i++) {
            const a = samples[Math.max(0, i - 1)], b = samples[Math.min(len - 1, i + 1)];
            let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1;
            samples[i].nx = -ty / L; samples[i].ny = tx / L;
        }
        return { samples, cum, total: acc || 1 };
    }
    function sampleAt(path, s) {
        const d = Math.max(0, Math.min(1, s)) * path.total;
        let i = 1; while (i < path.cum.length && path.cum[i] < d) i++;
        i = Math.min(i, path.samples.length - 1);
        const a = path.samples[i - 1] || path.samples[i], b = path.samples[i];
        const seg = (path.cum[i] - path.cum[i - 1]) || 1;
        const f = (d - path.cum[i - 1]) / seg;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nx: b.nx, ny: b.ny };
    }
    function offsetAt(path, s, lateral) {
        const p = sampleAt(path, s);
        return { x: p.x + p.nx * lateral, y: p.y + p.ny * lateral };
    }
    function polyOffset(path, lateral, steps) {
        const out = [];
        for (let i = 0; i <= steps; i++) out.push(offsetAt(path, i / steps, lateral));
        return out;
    }
    function tracePath(c, pts) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y);
    }

    // ---- 依据形状/拐弯数生成路径点 ----
    function generatePath(el) {
        const w = (typeof W !== 'undefined' && W) ? W : 800;
        const h = (typeof H !== 'undefined' && H) ? H : 600;
        const n = Math.max(2, Math.round(el.bends || 4));
        const shape = el.shape || 'wave';
        const mx = 0.10, top = 0.30, bot = 0.80, mid = (top + bot) / 2, amp = (bot - top) / 2;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const x = (mx + t * (1 - 2 * mx)) * w;
            let y = mid * h;
            if (shape === 'arc') y = (mid - Math.sin(Math.PI * t) * amp * 0.9) * h;
            else if (shape === 's') y = (mid - Math.sin(t * Math.PI * 2) * amp) * h;
            else if (shape === 'wave') y = (mid - Math.sin(t * Math.PI * (n - 1)) * amp * 0.8) * h;
            pts.push({ x, y });
        }
        el.pts = pts;
    }
    function adjustPtsCount(el, target) {
        target = Math.max(2, Math.round(target));
        const P = el.pts;
        while (P.length < target) { // 拆分最长线段插入中点
            let bi = 0, bl = -1;
            for (let i = 0; i < P.length - 1; i++) {
                const d = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
                if (d > bl) { bl = d; bi = i; }
            }
            P.splice(bi + 1, 0, { x: (P[bi].x + P[bi + 1].x) / 2, y: (P[bi].y + P[bi + 1].y) / 2 });
        }
        while (P.length > target && P.length > 2) { // 删除居中的内部点
            P.splice(Math.floor(P.length / 2), 1);
        }
        el.bends = P.length;
    }

    return {
        type: 'race_track',
        label: '跑道',
        icon: '🏁',
        category: 'other',
        color: '#7fbf6a',

        defaults() {
            const el = {
                pts: [], shape: 'wave', bends: 6, lanes: 2, laneGap: 42,
                started: false, vTort: 0.0085, vHare: 0.12, sleepAt: 0.8, sleepTime: 120,
                color: '#7fbf6a', _timer: 0, _winner: null, _wasStarted: false
            };
            generatePath(el);
            return el;
        },

        onPlace(el) { generatePath(el); },
        scale(el, sx, sy) { for (const p of el.pts) { p.x *= sx; p.y *= sy; } },
        getPosition(el) { return sampleAt(buildPath(el), 0.5); },
        setPosition(el, x, y) {
            const p = this.getPosition(el);
            const dx = x - p.x, dy = y - p.y;
            for (const q of el.pts) { q.x += dx; q.y += dy; }
        },
        getRadius(el) { return buildPath(el).total / 2 + (el.lanes * el.laneGap) + 80; },
        hitTest(el, p, env) {
            const path = buildPath(el);
            const halfW = Math.max(el.lanes, 1) * el.laneGap / 2 + 14 * env.S;
            for (const q of path.samples) if (Math.hypot(p.x - q.x, p.y - q.y) < halfW) return true;
            return false;
        },
        getHandles(el) { return el.pts.map((p, i) => ({ id: 'p' + i, x: p.x, y: p.y })); },
        onHandleDrag(el, handleId, p) {
            const i = parseInt(String(handleId).slice(1), 10);
            if (i >= 0 && i < el.pts.length) { el.pts[i].x = p.x; el.pts[i].y = p.y; el.shape = 'custom'; }
        },

        properties: [
            { key: 'shape', label: '路线形状', type: 'select',
                options: [
                    { value: 'straight', label: '直线' },
                    { value: 'arc', label: '弧形' },
                    { value: 's', label: 'S 形' },
                    { value: 'wave', label: '波浪（多弯）' },
                    { value: 'custom', label: '自定义（拖拽路径点）' }
                ] },
            { key: 'bends', label: '拐弯数(路径点)', type: 'number', step: 1, min: 2, max: 12 },
            { key: 'lanes', label: '跑道道数', type: 'number', step: 1, min: 1, max: 6 },
            { key: 'laneGap', label: '道宽', type: 'number', step: 2, min: 24, max: 90 },
            { key: 'started', label: '开始比赛', type: 'checkbox' },
            { key: 'vTort', label: '乌龟速度', type: 'number', step: 0.001, min: 0.002, max: 0.05 },
            { key: 'vHare', label: '兔子速度', type: 'number', step: 0.01, min: 0.02, max: 0.5 },
            { key: 'sleepAt', label: '兔子睡觉点', type: 'range', min: 20, max: 95, scale: 100 },
            { key: 'sleepTime', label: '睡觉时长(秒)', type: 'number', step: 5, min: 0, max: 180 },
            { key: 'color', label: '草地颜色', type: 'color' }
        ],

        onPropertyChange(el, key, value) {
            if (key === 'shape' && value !== 'custom') generatePath(el);
            else if (key === 'bends') {
                if (el.shape !== 'custom') generatePath(el);
                else adjustPtsCount(el, value);
            }
        },

        onTap(el) { el.started = !el.started; },

        render: {
            main(el, scene, env) {
                const path = buildPath(el);
                step(el, scene, env, path);
                drawTrack(el, scene, env, path);
            }
        }
    };

    // ===== 比赛推进（弧长均匀） =====
    function step(el, scene, env, path) {
        const dt = env.lastDt || 0.016;
        const runners = scene.elements.filter(e => (e.type === 'turtle' || e.type === 'rabbit') && !e.__missing);
        const n = runners.length;

        if (el.started && !el._wasStarted) {
            el._wasStarted = true; el._timer = 0; el._winner = null;
            for (const r of runners) { r._progress = 0; r._slept = false; r._sleepLeft = (el.sleepTime || 0); r._state = 'idle'; }
        }
        if (!el.started) el._wasStarted = false;
        if (el.started && !el._winner) el._timer += dt;

        const laneCount = Math.max(el.lanes || 1, n);
        runners.forEach((r, i) => {
            if (r._progress == null) r._progress = 0;
            const lateral = (i - (n - 1) / 2) * el.laneGap;
            if (!el.started) {
                r._state = 'idle'; r._progress = 0;
            } else if (el._winner) {
                r._state = r._progress >= 1 ? 'done' : 'stopped';
            } else if (r._progress < 1) {
                if (r.type === 'rabbit') {
                    if (r._state !== 'sleep' && !r._slept && r._progress >= (el.sleepAt || 0.8)) {
                        r._slept = true; r._state = 'sleep'; r._sleepLeft = (el.sleepTime || 0);
                    }
                    if (r._state === 'sleep') { r._sleepLeft -= dt; if (r._sleepLeft <= 0) r._state = 'run'; }
                    else { r._state = 'run'; r._progress += el.vHare * dt; }
                } else { r._state = 'run'; r._progress += el.vTort * dt; }
                if (r._progress >= 1) { r._progress = 1; r._state = 'done'; if (!el._winner) el._winner = r; }
            }
            const pos = offsetAt(path, Math.max(0, Math.min(1, r._progress)), lateral);
            r.x = pos.x; r.y = pos.y;
        });
        void laneCount;
    }

    // ===== 绘制 =====
    function drawTrack(el, scene, env, path) {
        const c = env.ctx, S = env.S;
        const runners = scene.elements.filter(e => (e.type === 'turtle' || e.type === 'rabbit') && !e.__missing);
        const lanes = Math.max(el.lanes || 1, runners.length);
        const gap = el.laneGap || 42;
        const halfW = lanes * gap / 2;

        c.save();
        c.lineCap = 'round'; c.lineJoin = 'round';
        tracePath(c, polyOffset(path, 0, 120));
        c.strokeStyle = mix(el.color, '#000000', 0.15); c.lineWidth = lanes * gap + 26 * S; c.stroke();
        tracePath(c, polyOffset(path, 0, 120));
        c.strokeStyle = el.color; c.lineWidth = lanes * gap; c.stroke();

        c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.5 * S; c.setLineDash([10 * S, 8 * S]);
        for (let k = 1; k < lanes; k++) { tracePath(c, polyOffset(path, (k - lanes / 2) * gap, 90)); c.stroke(); }
        c.setLineDash([]);

        c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2 * S;
        tracePath(c, polyOffset(path, halfW, 90)); c.stroke();
        tracePath(c, polyOffset(path, -halfW, 90)); c.stroke();

        // 起点线
        const s0 = offsetAt(path, 0, -halfW), s1 = offsetAt(path, 0, halfW);
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4 * S;
        c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.stroke();

        // 终点黑白格
        const f = sampleAt(path, 1);
        const ang = Math.atan2(f.ny, f.nx);
        c.save();
        c.translate(f.x, f.y); c.rotate(ang);
        const across = lanes * gap, cols = 8, cellW = across / cols, rows = 2, cellH = 9 * S;
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
            c.fillStyle = (row + col) % 2 ? '#141414' : '#f5f5f5';
            c.fillRect(-across / 2 + col * cellW, -cellH + row * cellH, cellW, cellH);
        }
        c.restore();
        c.restore();

        // HUD
        const mid = sampleAt(path, 0.5);
        c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
        if (!el.started) {
            const est = (1 / (el.vTort || 0.0085)).toFixed(0);
            banner(c, `拖路径点改弯 · 拐弯${el.pts.length} · 预计用时~${est}s`, mid.x, mid.y - halfW - 22 * S, S);
        } else if (el._winner) {
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