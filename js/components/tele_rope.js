(function () {
    const SFX = {
        ctx: null,
        ensure() {
            if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        },
        beep(freq, dur, vol, type, delay) {
            if (!this.ctx) return;
            const t0 = this.ctx.currentTime + (delay || 0);
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t0);
            o.connect(g); g.connect(this.ctx.destination);
            g.gain.setValueAtTime(vol || 0.07, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.start(t0); o.stop(t0 + dur);
        },
        heard() { this.beep(660, 0.12, 0.1); this.beep(880, 0.14, 0.09, 'sine', 0.1); this.beep(1100, 0.2, 0.08, 'sine', 0.22); },
        miss() { this.beep(220, 0.16, 0.06, 'triangle'); this.beep(160, 0.22, 0.05, 'triangle', 0.12); }
    };

    const MATERIALS = {
        cotton: { label: '棉线',   decay: 1.0,  speed: 1.0,  color: '#d8c8a8', desc: '典型介质，传声中规中矩' },
        nylon:  { label: '尼龙线', decay: 0.62, speed: 1.15, color: '#7ec8ff', desc: '紧实光滑，声音损耗小' },
        steel:  { label: '钢丝',   decay: 0.34, speed: 1.55, color: '#c3cbdc', desc: '金属固体，传声最强最远' },
        rubber: { label: '橡皮筋', decay: 2.3,  speed: 0.72, color: '#e07a9a', desc: '弹性吸振，声音很快消失' }
    };
    function matOf(el) { return MATERIALS[el.material] || MATERIALS.cotton; }

    function ropePoint(el, t, S, time) {
        const tight = el.tension ?? 0.6;
        const x = el.ax + (el.bx - el.ax) * t;
        const y = el.ay + (el.by - el.ay) * t;
        const sag = (1 - tight) * 70 * S;
        const wob = Math.sin(time * 1.5 + t * 5) * 1.5 * S * (1 - tight);
        return { x, y: y + Math.sin(Math.PI * t) * sag + wob };
    }

    function anchorOf(cup, env) {
        return { x: cup.x, y: cup.y + 19 * env.S * (cup.size || 1) };
    }
    function maintainEnd(el, kx, ky, linkId, cups, R, excludeId, env) {
        if (linkId) {
            const cup = cups.find(c => c.id === linkId);
            if (!cup || cup.id === excludeId) return null;
            const a = anchorOf(cup, env);
            el[kx] = a.x; el[ky] = a.y;
            return linkId;
        }
        let best = null, bestD = R;
        for (const c of cups) {
            if (c.id === excludeId) continue;
            const a = anchorOf(c, env);
            const d = Math.hypot(el[kx] - a.x, el[ky] - a.y);
            if (d < bestD) { bestD = d; best = c; }
        }
        if (!best) return null;
        const a = anchorOf(best, env);
        el[kx] = a.x; el[ky] = a.y;
        SFX.beep(520, 0.06, 0.04, 'triangle');
        return best.id;
    }

    function offsetPts(pts, off) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
            const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
            let nx = -(next.y - prev.y), ny = next.x - prev.x;
            const nl = Math.hypot(nx, ny) || 1;
            out.push({ x: pts[i].x + nx / nl * off, y: pts[i].y + ny / nl * off });
        }
        return out;
    }
    function tracePath(c, pts) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y);
    }
    function drawRopeMaterial(c, el, pts, tight, S) {
        const mat = el.material || 'cotton';
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (mat === 'cotton') {
            tracePath(c, pts);
            c.strokeStyle = el.color; c.globalAlpha = 0.20; c.lineWidth = 8 * S; c.stroke();
            c.globalAlpha = 1; c.lineWidth = 3 * S; c.stroke();
            for (const ph of [0, Math.PI]) {
                c.beginPath();
                for (let i = 0; i < pts.length; i++) {
                    const off = Math.sin(i * 0.85 + ph) * 1.5 * S;
                    const o = offsetPts(pts, off)[i];
                    i ? c.lineTo(o.x, o.y) : c.moveTo(o.x, o.y);
                }
                c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1 * S; c.stroke();
            }
        } else if (mat === 'nylon') {
            tracePath(c, pts);
            c.strokeStyle = el.color; c.globalAlpha = 0.85; c.lineWidth = 2.2 * S; c.stroke();
            c.globalAlpha = 1;
            tracePath(c, offsetPts(pts, -1 * S));
            c.strokeStyle = `rgba(255,255,255,${0.3 + 0.45 * tight})`; c.lineWidth = 0.9 * S; c.stroke();
        } else if (mat === 'steel') {
            tracePath(c, pts);
            c.strokeStyle = '#4a5268'; c.lineWidth = 3 * S; c.stroke();
            tracePath(c, offsetPts(pts, -1 * S));
            c.strokeStyle = 'rgba(235,242,255,0.9)'; c.lineWidth = 1.1 * S; c.stroke();
            c.strokeStyle = 'rgba(20,26,40,0.5)'; c.lineWidth = 1 * S;
            for (let i = 4; i < pts.length - 3; i += 6) {
                const a = pts[i], b = offsetPts(pts, 1.6 * S)[i + 2];
                c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            }
        } else {
            tracePath(c, pts);
            c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 6.5 * S; c.stroke();
            c.strokeStyle = el.color; c.lineWidth = 5.2 * S; c.stroke();
            tracePath(c, offsetPts(pts, -1.3 * S));
            c.strokeStyle = 'rgba(255,255,255,0.30)'; c.lineWidth = 1.4 * S; c.stroke();
        }
    }

    return {
        type: 'tele_rope',
        label: '传声绳',
        icon: '🪢',
        category: 'other',
        color: '#d8b070',

        defaults() {
            return { ax: 260, ay: 320, bx: 720, by: 320, tension: 0.6,
                material: 'cotton', color: '#d8c8a8', _pulses: [] };
        },

        getPosition(el) { return { x: (el.ax + el.bx) / 2, y: (el.ay + el.by) / 2 }; },
        setPosition(el, x, y) {
            const p = this.getPosition(el);
            const dx = x - p.x, dy = y - p.y;
            el.ax += dx; el.ay += dy; el.bx += dx; el.by += dy;
        },
        getRadius(el, env) { return Math.hypot(el.bx - el.ax, el.by - el.ay) / 2 + 60 * env.S; },
        hitTest(el, p, env) {
            const mid = ropePoint(el, 0.5, env.S, env.time);
            const dx = el.bx - el.ax, dy = el.by - el.ay;
            const len2 = dx * dx + dy * dy || 1;
            let t = ((p.x - el.ax) * dx + (p.y - el.ay) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
            const pt = ropePoint(el, t, env.S, env.time);
            return Math.hypot(p.x - pt.x, p.y - pt.y) < 22 * env.S || Math.hypot(p.x - mid.x, p.y - mid.y) < 40 * env.S;
        },
        getHandles(el) {
            return [{ id: 'a', x: el.ax, y: el.ay }, { id: 'b', x: el.bx, y: el.by }];
        },
        onHandleDrag(el, handleId, p, env) {
            const snapR = 176 * env.S;
            if (handleId === 'a') {
                el.ax = p.x; el.ay = p.y;
                if (el._linkAId && el._cupA) {
                    const a = anchorOf(el._cupA, env);
                    if (Math.hypot(p.x - a.x, p.y - a.y) > snapR) el._linkAId = null;
                }
            } else {
                el.bx = p.x; el.by = p.y;
                if (el._linkBId && el._cupB) {
                    const a = anchorOf(el._cupB, env);
                    if (Math.hypot(p.x - a.x, p.y - a.y) > snapR) el._linkBId = null;
                }
            }
        },

        properties: [
            { key: 'ax', label: 'A端X', type: 'number' },
            { key: 'ay', label: 'A端Y', type: 'number' },
            { key: 'bx', label: 'B端X', type: 'number' },
            { key: 'by', label: 'B端Y', type: 'number' },
            { key: 'material', label: '材质', type: 'select',
                options: [
                    { value: 'cotton', label: '棉线' },
                    { value: 'nylon', label: '尼龙线' },
                    { value: 'steel', label: '钢丝' },
                    { value: 'rubber', label: '橡皮筋' }
                ] },
            { key: 'tension', label: '绷紧度', type: 'range', min: 0, max: 100, scale: 100 },
            { key: 'color', label: '颜色', type: 'color' }
        ],

        system: {
            update(scene, dt, env) {
                for (const el of scene.elements) {
                    if (el.type !== 'tele_rope') continue;
                    if (!Array.isArray(el._pulses)) el._pulses = [];
                    const cups = scene.elements.filter(c => c.type === 'tele_cup' && !c.__missing);
                    const R = 110 * env.S;

                    el._linkAId = maintainEnd(el, 'ax', 'ay', el._linkAId || null, cups, R, el._linkBId || null, env);
                    el._linkBId = maintainEnd(el, 'bx', 'by', el._linkBId || null, cups, R, el._linkAId, env);
                    const A = cups.find(c => c.id === el._linkAId) || null;
                    const B = cups.find(c => c.id === el._linkBId) || null;
                    el._cupA = A; el._cupB = B;

                    if (el._lastMaterial !== el.material) {
                        el._lastMaterial = el.material;
                        el.color = matOf(el).color;
                    }
                    const tight = el.tension ?? 0.6;
                    const mat = matOf(el);
                    const decay = (0.15 + (1 - tight) * 3.2) * mat.decay;
                    for (const pu of el._pulses) {
                        pu.t += pu.dir * dt * 1.8 * mat.speed * (0.6 + tight * 1.6);
                        pu.strength *= Math.exp(-decay * dt);
                        if (pu.t >= 1 || pu.t <= 0) {
                            pu.dead = true;
                            const target = pu.t >= 1 ? B : A;
                            if (target && target.id !== pu.src) {
                                if (pu.strength > 0.35) {
                                    target._hear = 1; target._glow = 1;
                                    target._status = '听到啦！'; target._statusOk = true; target._statusT = 2;
                                    SFX.ensure(); SFX.heard();
                                } else {
                                    target._status = `没听清……${mat.label}传声不行`;
                                    target._statusOk = false; target._statusT = 2;
                                    SFX.ensure(); SFX.miss();
                                }
                            }
                        }
                    }
                    el._pulses = el._pulses.filter(p => !p.dead);
                }
            }
        },

        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S, time = env.time;
                const tight = el.tension ?? 0.6;

                c.save();
                const pts = [];
                for (let i = 0; i <= 60; i++) pts.push(ropePoint(el, i / 60, S, time));
                const mat = matOf(el);
                c.strokeStyle = `rgba(140,200,255,${0.06 + tight * 0.18})`;
                c.lineWidth = 8 * S; c.lineCap = 'round';
                tracePath(c, pts); c.stroke();
                drawRopeMaterial(c, el, pts, tight, S);
                c.restore();

                for (const pu of el._pulses) {
                    const pos = ropePoint(el, Math.max(0, Math.min(1, pu.t)), S, time);
                    const rad = (10 + pu.strength * 14) * S;
                    const c1 = pu.loud ? '255,200,120' : '168,200,255';
                    const grd = c.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rad);
                    grd.addColorStop(0, `rgba(${c1},${Math.min(1, pu.strength * 1.4)})`);
                    grd.addColorStop(1, `rgba(${c1},0)`);
                    c.fillStyle = grd;
                    c.beginPath(); c.arc(pos.x, pos.y, rad, 0, Math.PI * 2); c.fill();
                }

                for (const end of [{ x: el.ax, y: el.ay, on: el._cupA }, { x: el.bx, y: el.by, on: el._cupB }]) {
                    c.beginPath(); c.arc(end.x, end.y, 6 * S, 0, Math.PI * 2);
                    c.fillStyle = end.on ? '#7fdd6e' : '#8898b0';
                    c.fill();
                    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5 * S; c.stroke();
                }

                const mid = ropePoint(el, 0.5, S, time);
                c.font = `${11 * S}px system-ui, sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'top';
                c.fillStyle = 'rgba(136,152,176,0.9)';
                const linked = el._cupA && el._cupB;
                const len = Math.round(Math.hypot(el.bx - el.ax, el.by - el.ay) / S / 2);
                c.fillText(`材质 ${mat.label} · 绷紧 ${Math.round(tight * 100)}% · ${len}cm · ${linked ? '两端已连接话筒' : '两端需各搭一个话筒'}`,
                    mid.x, mid.y + 14 * S);
            }
        }
    };
})()
