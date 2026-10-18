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
        speak(loud) {
            const base = loud ? 420 : 340;
            this.beep(base, 0.12, 0.08, 'triangle');
            this.beep(base * 1.25, 0.14, 0.07, 'triangle', 0.09);
            this.beep(base * 1.5, 0.16, 0.06, 'triangle', 0.18);
        }
    };
    function parseColor(hex) {
        let s = (hex || '#5eb3ff').replace('#', '');
        if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 94, g: 179, b: 255 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mix(hex, target, t) {
        const A = parseColor(hex), B = parseColor(target);
        return '#' + ['r', 'g', 'b'].map(k =>
            Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
    }

    function findRope(cup, scene, env) {
        let geo = null;
        for (const rope of scene.elements) {
            if (rope.type !== 'tele_rope' || rope.__missing) continue;
            if (rope._linkAId === cup.id) return { rope, side: 'A' };
            if (rope._linkBId === cup.id) return { rope, side: 'B' };
            if (!geo) {
                const R = 110 * env.S * (cup.size || 1);
                if (Math.hypot(cup.x - rope.ax, cup.y - rope.ay) < R) geo = { rope, side: 'A' };
                else if (Math.hypot(cup.x - rope.bx, cup.y - rope.by) < R) geo = { rope, side: 'B' };
            }
        }
        return geo;
    }

    return {
        type: 'tele_cup',
        label: '话筒',
        icon: '🥤',
        category: 'other',
        color: '#5eb3ff',

        defaults() {
            return {
                x: 200, y: 320, size: 1, volume: 'soft', color: '#5eb3ff',
                _mouth: 0, _hear: 0, _glow: 0, _status: '', _statusOk: true, _statusT: 0
            };
        },

        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) { el.x = x; el.y = y; },
        getRadius(el, env) { return 46 * env.S * (el.size || 1); },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'size', label: '大小', type: 'number', step: 0.1, min: 0.5, max: 2 },
            { key: 'volume', label: '音量', type: 'select',
                options: [{ value: 'soft', label: '小声' }, { value: 'loud', label: '大声' }] },
            { key: 'color', label: '颜色', type: 'color' }
        ],

        onTap(el, scene, env) {
            const loud = el.volume === 'loud';
            el._mouth = 1;
            SFX.ensure(); SFX.speak(loud);
            const conn = findRope(el, scene, env);
            if (!conn) {
                el._status = '我连的是哪根绳子？'; el._statusOk = false; el._statusT = 1.6;
                return;
            }
            conn.rope._pulses.push({
                t: conn.side === 'A' ? 0 : 1,
                dir: conn.side === 'A' ? 1 : -1,
                strength: loud ? 1.0 : 0.7,
                loud: loud, src: el.id
            });
        },

        system: {
            update(scene, dt, env) {
                for (const el of scene.elements) {
                    if (el.type !== 'tele_cup') continue;
                    el._mouth = (el._mouth || 0) * Math.exp(-dt * 6);
                    el._hear = (el._hear || 0) * Math.exp(-dt * 2.2);
                    el._glow = (el._glow || 0) * Math.exp(-dt * 2.5);
                    if (el._statusT > 0) el._statusT -= dt;
                }
            }
        },

        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S, time = env.time;
                const size = el.size || 1;
                const w = 64 * S * size, h = 56 * S * size;

                c.save();
                c.translate(el.x, el.y);
                if ((el._glow || 0) > 0.05) {
                    const gg = c.createRadialGradient(0, 0, 5, 0, 0, w * 1.35);
                    gg.addColorStop(0, `rgba(160,255,180,${el._glow * 0.5})`);
                    gg.addColorStop(1, 'rgba(160,255,180,0)');
                    c.fillStyle = gg;
                    c.beginPath(); c.arc(0, 0, w * 1.35, 0, Math.PI * 2); c.fill();
                }
                if ((el._hear || 0) > 0.05) c.translate(Math.sin(time * 40) * 4 * S * el._hear, 0);

                c.globalAlpha = 0.3; c.fillStyle = '#000';
                c.beginPath(); c.ellipse(0, h / 2 + 4 * S, w * 0.45, 4 * S, 0, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;

                c.beginPath();
                c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2);
                c.lineTo(w * 0.34, h / 2); c.lineTo(-w * 0.34, h / 2); c.closePath();
                const grad = c.createLinearGradient(-w / 2, 0, w / 2, 0);
                grad.addColorStop(0, mix(el.color, '#000000', 0.35));
                grad.addColorStop(0.45, el.color);
                grad.addColorStop(0.75, mix(el.color, '#ffffff', 0.45));
                grad.addColorStop(1, mix(el.color, '#000000', 0.2));
                c.fillStyle = grad; c.fill();
                c.strokeStyle = mix(el.color, '#000000', 0.55);
                c.lineWidth = 2 * S; c.stroke();

                c.beginPath(); c.ellipse(0, -h / 2, w / 2, 6 * S * size, 0, 0, Math.PI * 2);
                c.fillStyle = 'rgba(20,30,50,0.85)'; c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2 * S; c.stroke();

                c.beginPath(); c.arc(0, h * 0.34, 4 * S * size, 0, Math.PI * 2);
                c.fillStyle = '#3a4258'; c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.3 * S; c.stroke();

                const blink = Math.sin(time * 1.2) > 0.96 ? 0.15 : 1;
                for (const sign of [-1, 1]) {
                    if ((el._hear || 0) > 0.2) {
                        c.strokeStyle = '#1a2030'; c.lineWidth = 2.4 * S; c.lineCap = 'round';
                        c.beginPath();
                        c.arc(sign * w * 0.14, -h * 0.08, 5 * S * size, Math.PI + 0.4, -0.4);
                        c.stroke();
                    } else {
                        c.beginPath();
                        c.ellipse(sign * w * 0.14, -h * 0.08, 5 * S * size, 5 * S * size * blink, 0, 0, Math.PI * 2);
                        c.fillStyle = '#1a2030'; c.fill();
                    }
                }
                const my = h * 0.16;
                if (el._mouth > 0.05) {
                    c.beginPath();
                    c.ellipse(0, my, 6 * S * size * el._mouth * 0.8, 8 * S * size * el._mouth, 0, 0, Math.PI * 2);
                    c.fillStyle = '#3a1a2a'; c.fill();
                } else {
                    c.beginPath();
                    c.arc(0, my, 5 * S * size, 0.3, Math.PI - 0.3);
                    c.strokeStyle = '#1a2030'; c.lineWidth = 2 * S; c.lineCap = 'round'; c.stroke();
                }

                if (el._statusT > 0 && el._status) {
                    c.font = `bold ${12 * S}px system-ui, sans-serif`;
                    c.textAlign = 'center'; c.textBaseline = 'middle';
                    const tw = c.measureText(el._status).width;
                    c.fillStyle = 'rgba(0,0,0,0.65)';
                    c.beginPath();
                    if (c.roundRect) c.roundRect(-tw / 2 - 9 * S, -h / 2 - 34 * S, tw + 18 * S, 22 * S, 11 * S);
                    else c.rect(-tw / 2 - 9 * S, -h / 2 - 34 * S, tw + 18 * S, 22 * S);
                    c.fill();
                    c.fillStyle = el._statusOk ? '#7fdd6e' : '#ff9eb5';
                    c.fillText(el._status, 0, -h / 2 - 23 * S);
                }
                c.restore();
            }
        }
    };
})()
