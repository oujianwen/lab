(function () {
    const SFX = {
        ctx: null,
        ensure() {
            if (!this.ctx) {
                try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
            }
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        },
        beep(freq, dur, vol, type, delay) {
            if (!this.ctx) return;
            const t0 = this.ctx.currentTime + (delay || 0);
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t0);
            o.connect(g); g.connect(this.ctx.destination);
            g.gain.setValueAtTime(vol || 0.07, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.start(t0); o.stop(t0 + dur);
        },
        speak(loud) {
            const base = loud ? 420 : 340;
            this.beep(base, 0.12, 0.08, 'triangle');
            this.beep(base * 1.25, 0.14, 0.07, 'triangle', 0.09);
            this.beep(base * 1.5, 0.16, 0.06, 'triangle', 0.18);
        },
        heard() {
            this.beep(660, 0.12, 0.10); this.beep(880, 0.14, 0.09, 'sine', 0.10);
            this.beep(1100, 0.20, 0.08, 'sine', 0.22);
        },
        miss() {
            this.beep(220, 0.16, 0.06, 'triangle'); this.beep(160, 0.22, 0.05, 'triangle', 0.12);
        }
    };

    function ropePoint(el, t, S, time) {
        const tight = el.tightness ?? 0.6;
        const x = el.x + (el.rx - el.x) * t;
        const y = el.y + (el.ry - el.y) * t;
        const sag = (1 - tight) * 90 * S * el.size;
        const wob = Math.sin(time * 1.5 + t * 5) * 1.5 * S * (1 - tight);
        return { x, y: y + Math.sin(Math.PI * t) * sag + wob };
    }

    function emitPulse(el) {
        const loud = el.volume === 'loud';
        el._pulses.push({ t: 0, strength: loud ? 1.0 : 0.7, loud });
        el._ripples.push({ x: el.x, y: el.y, r: 5, maxR: 34, life: 1, color: loud ? '#ffb055' : '#a8c8ff' });
        el._mouth = 1;
        SFX.ensure();
        SFX.speak(loud);
    }

    function arrive(el, p, S) {
        if (p.strength > 0.35) {
            el._shake = 1; el._glow = 1; el._listen = 1;
            el._status = '听到啦！'; el._statusOk = true;
            SFX.ensure(); SFX.heard();
            for (let i = 0; i < 12; i++) {
                const a = Math.random() * Math.PI * 2;
                const v = 70 + Math.random() * 130;
                el._sparks.push({
                    x: el.rx, y: el.ry,
                    vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
                    life: 1, size: 2.5 + Math.random() * 3.5, rot: Math.random() * 6.28
                });
            }
            el._ripples.push({ x: el.rx, y: el.ry, r: 5, maxR: 44, life: 1, color: '#7fdd6e' });
        } else {
            el._status = '声音没传过来……'; el._statusOk = false;
            SFX.ensure(); SFX.miss();
        }
        el._statusT = 2.4;
    }

    function updateCup(el, dt, S) {
        if (el.speaking && !el._spoke) { el._spoke = true; emitPulse(el); }
        if (!el.speaking) el._spoke = false;

        el._mouth = (el._mouth || 0) * Math.exp(-dt * 6);
        el._shake = (el._shake || 0) * Math.exp(-dt * 4);
        el._glow = (el._glow || 0) * Math.exp(-dt * 2.5);
        el._listen = (el._listen || 0) * Math.exp(-dt * 1.6);
        if (el._statusT > 0) el._statusT -= dt;

        const tight = el.tightness ?? 0.6;
        const decay = 0.15 + (1 - tight) * 3.2;
        for (const p of el._pulses) {
            p.t += dt * 1.8 * (0.6 + tight * 1.6);
            p.strength *= Math.exp(-decay * dt);
            if (p.t >= 1) { p.dead = true; arrive(el, p, S); }
        }
        el._pulses = el._pulses.filter(p => !p.dead);

        for (const r of el._ripples) { r.r += (r.maxR - r.r) * Math.min(1, dt * 5); r.life -= dt * 1.6; }
        el._ripples = el._ripples.filter(r => r.life > 0);

        for (const s of el._sparks) {
            s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * dt; s.vx *= 0.97;
            s.life -= dt * 1.2; s.rot += dt * 6;
        }
        el._sparks = el._sparks.filter(s => s.life > 0);
    }

    function drawCup(c, x, y, w, h, facing, opts, S, time) {
        c.save();
        c.translate(x + (opts.shake ? Math.sin(time * 40) * 4 * S * opts.shake : 0), y);
        if (opts.glow > 0.05) {
            const gg = c.createRadialGradient(0, 0, 5, 0, 0, w * 1.6);
            gg.addColorStop(0, `rgba(160,255,180,${opts.glow * 0.55})`);
            gg.addColorStop(1, 'rgba(160,255,180,0)');
            c.fillStyle = gg;
            c.beginPath(); c.arc(0, 0, w * 1.6, 0, Math.PI * 2); c.fill();
        }
        const wideX = facing === 'left' ? -w / 2 : w / 2;
        const narrowX = facing === 'left' ? w / 2 : -w / 2;
        c.beginPath();
        c.moveTo(wideX, -h / 2); c.lineTo(narrowX, -h * 0.30);
        c.lineTo(narrowX, h * 0.30); c.lineTo(wideX, h / 2); c.closePath();
        const grad = c.createLinearGradient(wideX, 0, narrowX, 0);
        if (facing === 'left') { grad.addColorStop(0, '#8fc8ff'); grad.addColorStop(0.55, '#5eb3ff'); grad.addColorStop(1, '#2a6ba8'); }
        else { grad.addColorStop(0, '#ffc8c8'); grad.addColorStop(0.55, '#e88585'); grad.addColorStop(1, '#a85050'); }
        c.fillStyle = grad; c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2.4 * S;
        c.beginPath(); c.moveTo(wideX, -h / 2); c.lineTo(wideX, h / 2); c.stroke();
        c.strokeStyle = facing === 'left' ? 'rgba(40,100,160,0.85)' : 'rgba(140,50,50,0.85)';
        c.lineWidth = 2 * S;
        c.beginPath();
        c.moveTo(wideX, -h / 2); c.lineTo(narrowX, -h * 0.30);
        c.lineTo(narrowX, h * 0.30); c.lineTo(wideX, h / 2); c.closePath(); c.stroke();
        /* 表情 */
        const cx = facing === 'left' ? -w * 0.15 : w * 0.15;
        const cy = -h * 0.08;
        const eyeR = 5.5 * S, eyeOff = w * 0.14;
        const blink = (Math.sin(time * 1.2 + (facing === 'left' ? 0 : 1)) > 0.96) ? 0.15 : 1;
        for (const sign of [-1, 1]) {
            c.beginPath();
            c.ellipse(cx + sign * eyeOff, cy, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
            c.fillStyle = '#1a2030'; c.fill();
        }
        const mouthY = cy + 14 * S;
        if (opts.mouthOpen > 0.05) {
            const openR = 6 * S * opts.mouthOpen;
            c.beginPath(); c.ellipse(cx, mouthY + 2 * S, openR * 0.8, openR * 1.1, 0, 0, Math.PI * 2);
            c.fillStyle = '#3a1a2a'; c.fill();
        } else {
            c.beginPath();
            c.arc(cx, mouthY, 5 * S, opts.listen > 0.2 ? 0.15 : 0.3, opts.listen > 0.2 ? Math.PI - 0.15 : Math.PI - 0.3);
            c.strokeStyle = '#1a2030'; c.lineWidth = 2 * S; c.lineCap = 'round'; c.stroke();
        }
        c.restore();
    }

    return {
        type: 'telephone',
        label: '传声筒',
        icon: '📞',
        category: 'other',
        color: '#8cc8ff',

        defaults() {
            return {
                x: 260, y: 320,
                rx: 720, ry: 320,
                size: 1.0,
                tightness: 0.6,
                volume: 'soft',
                speaking: false,
                color: '#c8a060',
                _pulses: [], _ripples: [], _sparks: [],
                _mouth: 0, _shake: 0, _glow: 0, _listen: 0,
                _status: '', _statusOk: false, _statusT: 0, _spoke: false
            };
        },

        getPosition(el) { return { x: (el.x + el.rx) / 2, y: (el.y + el.ry) / 2 }; },
        setPosition(el, x, y) {
            const p = this.getPosition(el);
            const dx = x - p.x, dy = y - p.y;
            el.x += dx; el.y += dy; el.rx += dx; el.ry += dy;
        },
        getRadius(el, env) {
            return Math.hypot(el.rx - el.x, el.ry - el.y) / 2 + 60 * env.S * el.size;
        },
        hitTest(el, p, env) {
            const r = 55 * env.S * el.size;
            if (Math.hypot(p.x - el.x, p.y - el.y) < r) return true;
            if (Math.hypot(p.x - el.rx, p.y - el.ry) < r) return true;
            const mid = ropePoint(el, 0.5, env.S, env.time);
            return Math.hypot(p.x - mid.x, p.y - mid.y) < 40 * env.S + Math.hypot(el.rx - el.x, el.ry - el.y) * 0.3;
        },
        getHandles(el) { return [{ id: 'right', x: el.rx, y: el.ry }]; },
        onHandleDrag(el, handleId, p) {
            if (handleId !== 'right') return;
            let nx = p.x, ny = p.y;
            const minDist = 170 * el.size;
            const dx = nx - el.x;
            if (Math.abs(dx) < minDist) nx = el.x + (dx >= 0 ? minDist : -minDist);
            el.rx = nx; el.ry = ny;
        },

        properties: [
            { key: 'x', label: '左杯X', type: 'number' },
            { key: 'y', label: '左杯Y', type: 'number' },
            { key: 'rx', label: '右杯X', type: 'number' },
            { key: 'ry', label: '右杯Y', type: 'number' },
            { key: 'size', label: '大小', type: 'number', step: 0.1, min: 0.5, max: 2 },
            { key: 'tightness', label: '松紧', type: 'range', min: 0, max: 100, scale: 100 },
            { key: 'volume', label: '音量', type: 'select',
                options: [{ value: 'soft', label: '小声' }, { value: 'loud', label: '大声' }] },
            { key: 'speaking', label: '说话', type: 'checkbox' }
        ],

        system: {
            update(scene, dt, env) {
                for (const el of scene.elements) {
                    if (el.type !== 'telephone') continue;
                    if (!Array.isArray(el._pulses)) { el._pulses = []; el._ripples = []; el._sparks = []; }
                    updateCup(el, dt, env.S);
                }
            }
        },

        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S, time = env.time;

                /* 绳子 */
                const tight = el.tightness ?? 0.6;
                c.save();
                c.beginPath();
                for (let i = 0; i <= 60; i++) {
                    const p = ropePoint(el, i / 60, S, time);
                    i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y);
                }
                c.strokeStyle = `rgba(140,200,255,${0.08 + tight * 0.22})`;
                c.lineWidth = 8 * S; c.lineCap = 'round'; c.stroke();
                const r = Math.round(140 + tight * 115), g = Math.round(120 + tight * 135), b = Math.round(110 + tight * 145);
                c.strokeStyle = `rgb(${r},${g},${b})`; c.lineWidth = 2.6 * S; c.stroke();
                c.restore();

                /* 脉冲 */
                for (const p of el._pulses) {
                    const pos = ropePoint(el, Math.min(1, p.t), S, time);
                    const rad = (12 + p.strength * 14) * S * el.size;
                    const c1 = p.loud ? '255,200,120' : '168,200,255';
                    const grd = c.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rad);
                    grd.addColorStop(0, `rgba(${c1},${Math.min(1, p.strength * 1.4)})`);
                    grd.addColorStop(0.5, `rgba(${c1},${p.strength * 0.5})`);
                    grd.addColorStop(1, `rgba(${c1},0)`);
                    c.fillStyle = grd;
                    c.beginPath(); c.arc(pos.x, pos.y, rad, 0, Math.PI * 2); c.fill();
                }

                /* 杯子 */
                const w = 92 * S * el.size, h = 72 * S * el.size;
                const bobL = Math.sin(time * 1.6) * 1.5 * S, bobR = Math.sin(time * 1.4 + 1) * 1.5 * S;
                drawCup(c, el.x, el.y + bobL, w, h, 'left', { mouthOpen: el._mouth, listen: el._listen }, S, time);
                drawCup(c, el.rx, el.ry + bobR, w, h, 'right', { shake: el._shake, glow: el._glow, listen: el._listen }, S, time);

                /* 涟漪 / 火花 */
                for (const rp of el._ripples) {
                    c.save(); c.globalAlpha = rp.life * 0.85;
                    c.beginPath(); c.arc(rp.x, rp.y, rp.r * el.size, 0, Math.PI * 2);
                    c.strokeStyle = rp.color; c.lineWidth = 2.6 * S; c.stroke(); c.restore();
                }
                for (const sp of el._sparks) {
                    c.save(); c.translate(sp.x, sp.y); c.rotate(sp.rot); c.globalAlpha = sp.life;
                    c.fillStyle = '#ffd54f';
                    c.beginPath(); c.arc(0, 0, sp.size * S, 0, Math.PI * 2); c.fill(); c.restore();
                }

                /* 状态 / 距离 */
                const midX = (el.x + el.rx) / 2;
                const topY = Math.min(el.y, el.ry) - 60 * S * el.size;
                if (el._statusT > 0) {
                    c.save();
                    c.font = `bold ${14 * S}px system-ui, sans-serif`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    const txt = el._status;
                    const tw = c.measureText(txt).width;
                    c.fillStyle = 'rgba(0,0,0,0.6)';
                    c.beginPath();
                    if (c.roundRect) c.roundRect(midX - tw / 2 - 12 * S, topY - 14 * S, tw + 24 * S, 28 * S, 14 * S);
                    else c.rect(midX - tw / 2 - 12 * S, topY - 14 * S, tw + 24 * S, 28 * S);
                    c.fill();
                    c.fillStyle = el._statusOk ? '#7fdd6e' : '#ff9eb5';
                    c.fillText(txt, midX, topY);
                    c.restore();
                }
                c.save();
                c.font = `${11 * S}px system-ui, sans-serif`;
                c.textAlign = 'center';
                c.fillStyle = 'rgba(136,152,176,0.9)';
                const cm = Math.round(Math.hypot(el.rx - el.x, el.ry - el.y) / S / 2);
                c.fillText(`距离 ${cm} 厘米 · 松紧 ${Math.round(tight * 100)}%`, midX, Math.max(el.y, el.ry) + 60 * S * el.size);
                c.restore();
            }
        }
    };
})()
