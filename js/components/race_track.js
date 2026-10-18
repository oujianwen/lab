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
    function runnerName(r) { return r.type === 'turtle' ? '乌龟' : '兔子'; }

    return {
        type: 'race_track',
        label: '跑道',
        icon: '🏁',
        category: 'other',
        color: '#7fbf6a',

        defaults() {
            const w = (typeof W !== 'undefined' && W) ? W : 800;
            const h = (typeof H !== 'undefined' && H) ? H : 600;
            return {
                x: w * 0.5, y: h * 0.6, length: Math.min(w * 0.82, 760),
                started: false, vTort: 0.075, vHare: 0.45, sleepAt: 0.7, sleepTime: 12,
                color: '#7fbf6a', _timer: 0, _winner: null, _wasStarted: false
            };
        },

        onPlace(el, x, y, env) {
            el.x = x; el.y = y;
            el.length = Math.min(env.W * 0.82, 760 * (env.S || 1));
        },
        scale(el, sx, sy) { el.x *= sx; el.y *= sy; el.length *= sx; },
        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) { el.x = x; el.y = y; },
        getRadius(el, env) { return el.length / 2 + 40 * env.S; },
        hitTest(el, p, env) {
            return Math.abs(p.y - el.y) < 70 * env.S &&
                p.x >= el.x - el.length / 2 - 20 * env.S &&
                p.x <= el.x + el.length / 2 + 20 * env.S;
        },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'length', label: '赛道长度', type: 'number', min: 200, max: 3000 },
            { key: 'started', label: '开始比赛', type: 'checkbox' },
            { key: 'vTort', label: '乌龟速度', type: 'number', step: 0.01, min: 0.02, max: 0.5 },
            { key: 'vHare', label: '兔子速度', type: 'number', step: 0.01, min: 0.05, max: 0.8 },
            { key: 'sleepAt', label: '兔子睡觉点', type: 'range', min: 20, max: 90, scale: 100 },
            { key: 'sleepTime', label: '睡觉时长(秒)', type: 'number', step: 0.5, min: 0, max: 30 },
            { key: 'color', label: '草地颜色', type: 'color' }
        ],

        onTap(el) { el.started = !el.started; },

        system: {
            update(el, scene, dt, env) {}
        },

        // 注：平台 system.update 签名是 (scene, dt, env)，跑道需要遍历自己的元素，
        // 故把真实逻辑放在下面这个对象里（覆盖上面的占位）。
        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S;
                // —— 每帧比赛推进放在 render 顶部执行，保证拿到跑道自身元素 ——
                RaceStep(el, scene, env);
                drawTrack(el, scene, env);
            }
        }
    };

    // ===== 内部逻辑 =====
    function RaceStep(el, scene, env) {
        const S = env.S;
        const runners = scene.elements.filter(e => (e.type === 'turtle' || e.type === 'rabbit') && !e.__missing);
        const startX = el.x - el.length / 2 + 40 * S;
        const finishX = el.x + el.length / 2 - 40 * S;
        const span = finishX - startX;
        const n = runners.length;

        if (el.started && !el._wasStarted) {
            el._wasStarted = true; el._timer = 0; el._winner = null;
            for (const r of runners) { r._progress = 0; r._slept = false; r._sleepLeft = (el.sleepTime || 0); r._state = 'idle'; }
        }
        if (!el.started) el._wasStarted = false;
        if (el.started && !el._winner) el._timer += env.lastDt || 0.016;

        runners.forEach((r, i) => {
            if (r._progress == null) r._progress = 0;
            const laneY = el.y + (i - (n - 1) / 2) * 52 * S;
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
                        r._sleepLeft -= (env.lastDt || 0.016);
                        if (r._sleepLeft <= 0) r._state = 'run';
                    } else {
                        r._state = 'run'; r._progress += el.vHare * (env.lastDt || 0.016);
                    }
                } else {
                    r._state = 'run'; r._progress += el.vTort * (env.lastDt || 0.016);
                }
                if (r._progress >= 1) { r._progress = 1; r._state = 'done'; if (!el._winner) el._winner = r; }
            }
            r.x = startX + r._progress * span;
            r.y = laneY;
        });
    }

    function drawTrack(el, scene, env) {
        const c = env.ctx, S = env.S;
        const startX = el.x - el.length / 2 + 40 * S;
        const finishX = el.x + el.length / 2 - 40 * S;
        const runners = scene.elements.filter(e => (e.type === 'turtle' || e.type === 'rabbit') && !e.__missing);
        const laneGap = 52 * S;
        const topY = el.y - ((runners.length - 1) / 2) * laneGap - 34 * S;
        const botY = el.y + ((runners.length - 1) / 2) * laneGap + 34 * S;
        const pad = 26 * S;

        c.save();
        // 草地
        const gg = c.createLinearGradient(0, topY - pad, 0, botY + pad);
        gg.addColorStop(0, mix(el.color, '#ffffff', 0.25));
        gg.addColorStop(1, mix(el.color, '#000000', 0.3));
        c.fillStyle = gg;
        if (c.roundRect) { c.beginPath(); c.roundRect(startX - pad, topY - pad, (finishX - startX) + pad * 2, (botY - topY) + pad * 2, 16 * S); c.fill(); }
        else c.fillRect(startX - pad, topY - pad, (finishX - startX) + pad * 2, (botY - topY) + pad * 2);
        // 跑道分隔线
        c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5 * S;
        for (let i = 0; i < runners.length - 1; i++) {
            const ly = el.y + (i - (runners.length - 1) / 2 + 0.5) * laneGap;
            c.beginPath(); c.setLineDash([8 * S, 8 * S]);
            c.moveTo(startX - pad + 6 * S, ly); c.lineTo(finishX + pad - 6 * S, ly); c.stroke();
        }
        c.setLineDash([]);

        // 起跑线
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3 * S;
        c.beginPath(); c.moveTo(startX - 10 * S, topY - pad); c.lineTo(startX - 10 * S, botY + pad); c.stroke();

        // 终点黑白格
        const sq = 10 * S, cols = 2;
        for (let r = 0; r * sq < (botY - topY + pad * 2); r++) {
            for (let k = 0; k < cols; k++) {
                c.fillStyle = ((r + k) % 2 === 0) ? '#111' : '#f5f5f5';
                c.fillRect(finishX + k * sq, topY - pad + r * sq, sq, sq);
            }
        }
        c.restore();

        // HUD / 提示
        c.save();
        c.textBaseline = 'middle'; c.textAlign = 'center';
        c.font = `bold ${13 * S}px system-ui, sans-serif`;
        if (!el.started) {
            c.fillStyle = 'rgba(0,0,0,0.5)';
            banner(c, '点击赛道 或 勾选「开始比赛」起跑', el.x, topY - pad - 16 * S, S);
        } else if (el._winner) {
            const isTort = el._winner.type === 'turtle';
            const txt = `${isTort ? '🐢 乌龟' : '🐰 兔子'}获胜！用时 ${el._timer.toFixed(1)}s`;
            c.fillStyle = 'rgba(0,0,0,0.55)';
            banner(c, txt, el.x, topY - pad - 18 * S, S, isTort ? '#7fdd6e' : '#ffb055');
        } else {
            c.fillStyle = 'rgba(0,0,0,0.45)';
            banner(c, `⏱ ${el._timer.toFixed(1)}s`, el.x, topY - pad - 16 * S, S);
        }
        c.restore();
    }

    function banner(c, text, cx, cy, S, color) {
        c.font = `bold ${13 * S}px system-ui, sans-serif`;
        const tw = c.measureText(text).width;
        const bw = tw + 22 * S, bh = 24 * S;
        c.beginPath();
        if (c.roundRect) c.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 12 * S); else c.rect(cx - bw / 2, cy - bh / 2, bw, bh);
        c.fill();
        c.fillStyle = color || '#cfe0f7';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, cx, cy + 1);
    }
})()
