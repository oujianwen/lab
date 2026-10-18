(function () {
    function parseColor(hex) {
        let s = (hex || '#5AD1FF').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 90, g: 209, b: 255 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mixHex(a, b, t) {
        const A = parseColor(a), B = parseColor(b);
        return '#' + ['r','g','b'].map(k =>
            Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
    }

    const GRAVITY = 900;

    function getRampEndpoints(ramp) {
        return {
            ax: ramp.x,
            ay: ramp.y,
            bx: ramp.x + Math.cos(ramp.angle) * ramp.length,
            by: ramp.y - Math.sin(ramp.angle) * ramp.length
        };
    }

    function projectOnSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return { t: 0, x: ax, y: ay, dist: Math.hypot(px - ax, py - ay) };
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const x = ax + dx * t;
        const y = ay + dy * t;
        return { t, x, y, dist: Math.hypot(px - x, py - y) };
    }

    function syncCartToRamp(cart, ramp, s) {
        const { ax, ay, bx, by } = getRampEndpoints(ramp);
        const L = ramp.length;
        const frac = Math.max(0, Math.min(1, s / L));
        cart.x = bx + (ax - bx) * frac;
        cart.y = by + (ay - by) * frac;
        cart._renderAngle = Math.atan2(ay - by, ax - bx);
    }

    function findNearestGround(grounds, y) {
        let best = null, bestD = Infinity;
        for (const gr of grounds) {
            const d = Math.abs(gr.y - y);
            if (d < bestD) { bestD = d; best = gr; }
        }
        return best;
    }

    function updateCart(cart, ramps, grounds, dt, env) {
        if (cart._phase == null) cart._phase = 'idle';
        if (cart._v == null) cart._v = 0;
        if (cart._vGround == null) cart._vGround = 0;
        if (cart.started == null) cart.started = false;

        // === 未启动：吸附在坡面/地面上保持静止 ===
        if (!cart.started) {
            if (cart._phase === 'ramp') {
                const ramp = ramps.find(r => r.id === cart._rampId);
                if (ramp) {
                    cart._v = 0;
                    cart._rampS = Math.max(0, Math.min(cart._rampS, ramp.length));
                    syncCartToRamp(cart, ramp, cart._rampS);
                } else {
                    cart._phase = 'idle';
                }
            } else if (cart._phase === 'ground') {
                cart._vGround = 0;
                const g = findNearestGround(grounds, cart._groundY || cart.y);
                if (g) cart._groundY = g.y;
                cart.x = cart._groundX;
                cart.y = cart._groundY;
                cart._renderAngle = 0;
            }
            return;
        }

        // === idle：检测当前位置 ===
        if (cart._phase === 'idle') {
            let bestRamp = null, bestDist = Infinity, bestT = 0;
            for (const r of ramps) {
                const { ax, ay, bx, by } = getRampEndpoints(r);
                const proj = projectOnSegment(cart.x, cart.y, ax, ay, bx, by);
                if (proj.dist < 50 && proj.t >= 0.02 && proj.t <= 0.98) {
                    if (proj.dist < bestDist) {
                        bestDist = proj.dist;
                        bestRamp = r;
                        bestT = proj.t;
                    }
                }
            }
            if (bestRamp) {
                cart._phase = 'ramp';
                cart._rampId = bestRamp.id;
                cart._rampS = (1 - bestT) * bestRamp.length;
                cart._v = 0;
                syncCartToRamp(cart, bestRamp, cart._rampS);
                return;
            }
            cart._phase = 'ground';
            cart._groundX = cart.x;
            const g = findNearestGround(grounds, cart.y);
            cart._groundY = g ? g.y : env.H * 0.85;
            cart.y = cart._groundY;
            cart._renderAngle = 0;
            return;
        }

        // === ramp：斜面物理 ===
        if (cart._phase === 'ramp') {
            const ramp = ramps.find(r => r.id === cart._rampId);
            if (!ramp) { cart._phase = 'idle'; return; }

            const theta = ramp.angle;
            const mu = ramp.friction || 0.1;
            const sinT = Math.sin(theta);
            const cosT = Math.cos(theta);

            let a = 0;
            const speed = cart._v;
            if (Math.abs(speed) < 2 && sinT <= mu * cosT) {
                a = 0;
                cart._v = 0;
            } else {
                a = GRAVITY * sinT;
                if (Math.abs(speed) > 2) {
                    a -= mu * GRAVITY * cosT * Math.sign(speed);
                }
            }

            cart._v += a * dt;
            if (cart._v < 0 && cart._rampS <= 0) cart._v = 0;
            cart._rampS += cart._v * dt;

            if (cart._rampS >= ramp.length) {
                cart._phase = 'ground';
                cart._groundX = ramp.x;
                const _ep = getRampEndpoints(ramp);
                cart._vGround = Math.max(0, cart._v) * (_ep.ax - _ep.bx) / ramp.length;
                cart._v = 0;
                const g = findNearestGround(grounds, ramp.y);
                cart._groundY = g ? g.y : ramp.y;
                cart.x = cart._groundX;
                cart.y = cart._groundY;
                cart._renderAngle = 0;
            } else if (cart._rampS < 0) {
                cart._rampS = 0;
                cart._v = 0;
                syncCartToRamp(cart, ramp, 0);
            } else {
                syncCartToRamp(cart, ramp, cart._rampS);
            }
            return;
        }

        // === ground：地面摩擦 ===
        if (cart._phase === 'ground') {
            const g = findNearestGround(grounds, cart._groundY || cart.y);
            const mu = g ? (g.friction || 0.15) : 0.15;
            if (g) cart._groundY = g.y;

            if (Math.abs(cart._vGround) < 2) {
                cart._vGround = 0;
            } else {
                const oldV = cart._vGround;
                cart._vGround += -mu * GRAVITY * Math.sign(oldV) * dt;
                if (Math.sign(cart._vGround) !== Math.sign(oldV)) cart._vGround = 0;
            }

            cart._groundX += cart._vGround * dt;
            cart.x = cart._groundX;
            cart.y = cart._groundY;
            cart._renderAngle = 0;
        }
    }

    return {
        type: 'cart',
        label: '小车',
        icon: '🚗',
        category: 'mechanical',
        color: '#5AD1FF',

        defaults() {
            return {
                x: 400, y: 500,
                w: 60, h: 32,
                mass: 1,
                color: '#5AD1FF',
                _phase: 'idle',
                _v: 0,
                _vGround: 0,
                _rampId: null,
                _rampS: 0,
                _groundX: 400,
                _groundY: 500,
                _renderAngle: 0
            };
        },

        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) {
            el.x = x;
            el.y = y;
            el._phase = 'idle';
            el.started = false;
            el._v = 0;
            el._vGround = 0;
            el._rampId = null;
            el._rampS = 0;
            el._groundX = x;
            el._groundY = y;
            el._renderAngle = 0;
        },
        getRadius(el, env) { return Math.max(el.w, el.h) / 2 + 12 * (env && env.S ? env.S : 1); },
        hitTest(el, p, env) {
            const S = (env && env.S) ? env.S : 1;
            return Math.abs(p.x - el.x) < el.w / 2 + 8 * S &&
                Math.abs(p.y - el.y) < el.h / 2 + 8 * S;
        },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'w', label: '宽', type: 'number', min: 30, max: 200 },
            { key: 'h', label: '高', type: 'number', min: 16, max: 100 },
            { key: 'mass', label: '质量', type: 'number', min: 0.5, max: 10, step: 0.1 },
            { key: 'color', label: '颜色', type: 'color' },
            { key: 'started', label: '启动', type: 'checkbox' }
        ],

        system: {
            update(scene, dt, env) {
                const ramps = scene.elements.filter(e => e.type === 'ramp' && !e.__missing);
                const grounds = scene.elements.filter(e => e.type === 'ground' && !e.__missing);
                for (const cart of scene.elements) {
                    if (cart.type !== 'cart') continue;
                    updateCart(cart, ramps, grounds, dt, env);
                }
            }
        },

        render: {
            main(el, scene, env) {
                const c = env.ctx;
                const S = (env && env.S) ? env.S : 1;

                c.save();
                c.translate(el.x, el.y);
                c.rotate(el._renderAngle || 0);

                const w = el.w, h = el.h;
                const wheelR = h * 0.3;

                // 阴影
                c.save();
                c.globalAlpha = 0.3;
                c.beginPath();
                c.ellipse(0, h / 2 + wheelR * 0.4, w * 0.6, 4 * S, 0, 0, Math.PI * 2);
                c.fillStyle = '#000';
                c.fill();
                c.restore();

                // 车身
                const grad = c.createLinearGradient(0, -h / 2, 0, h / 2);
                grad.addColorStop(0, mixHex(el.color, '#ffffff', 0.4));
                grad.addColorStop(0.5, el.color);
                grad.addColorStop(1, mixHex(el.color, '#000000', 0.4));
                c.fillStyle = grad;
                c.strokeStyle = mixHex(el.color, '#000000', 0.6);
                c.lineWidth = 2 * S;
                c.beginPath();
                const r = h * 0.15;
                c.moveTo(-w / 2 + r, -h / 2);
                c.lineTo(w / 2 - r, -h / 2);
                c.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
                c.lineTo(w / 2, h / 2 - r);
                c.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
                c.lineTo(-w / 2 + r, h / 2);
                c.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
                c.lineTo(-w / 2, -h / 2 + r);
                c.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
                c.closePath();
                c.fill();
                c.stroke();

                // 车窗
                c.fillStyle = 'rgba(255,255,255,0.45)';
                c.beginPath();
                if (c.roundRect) {
                    c.roundRect(-w * 0.25, -h * 0.3, w * 0.5, h * 0.35, 3 * S);
                } else {
                    c.rect(-w * 0.25, -h * 0.3, w * 0.5, h * 0.35);
                }
                c.fill();

                // 轮子
                c.fillStyle = '#222';
                c.beginPath();
                c.arc(-w * 0.3, h / 2, wheelR, 0, Math.PI * 2);
                c.fill();
                c.beginPath();
                c.arc(w * 0.3, h / 2, wheelR, 0, Math.PI * 2);
                c.fill();

                // 轮毂
                c.fillStyle = '#888';
                c.beginPath();
                c.arc(-w * 0.3, h / 2, wheelR * 0.4, 0, Math.PI * 2);
                c.fill();
                c.beginPath();
                c.arc(w * 0.3, h / 2, wheelR * 0.4, 0, Math.PI * 2);
                c.fill();

                c.restore();

                // 待启动提示
                if (!el.started && (el._phase === 'ramp' || el._phase === 'ground')) {
                    c.save();
                    c.font = `bold ${10 * S}px system-ui, sans-serif`;
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    const hint = '▶ 属性面板勾选「启动」';
                    const tw = c.measureText(hint).width;
                    c.fillStyle = 'rgba(0,0,0,0.65)';
                    c.beginPath();
                    if (c.roundRect) {
                        c.roundRect(el.x - tw / 2 - 8 * S, el.y - el.h - 26 * S, tw + 16 * S, 18 * S, 9 * S);
                    } else {
                        c.rect(el.x - tw / 2 - 8 * S, el.y - el.h - 26 * S, tw + 16 * S, 18 * S);
                    }
                    c.fill();
                    c.strokeStyle = 'rgba(94,209,255,0.5)';
                    c.lineWidth = 1 * S;
                    c.stroke();
                    c.fillStyle = '#9fe0b0';
                    c.fillText(hint, el.x, el.y - el.h - 17 * S);
                    c.restore();
                }

                // 速度标签
                const isMoving = (el._phase === 'ramp' && Math.abs(el._v) > 5) ||
                    (el._phase === 'ground' && Math.abs(el._vGround) > 5);
                if (isMoving) {
                    c.save();
                    c.font = `bold ${10 * S}px system-ui, sans-serif`;
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    const v = el._phase === 'ramp' ? Math.abs(el._v) : Math.abs(el._vGround);
                    const txt = `v = ${v.toFixed(0)}`;
                    const tw = c.measureText(txt).width;
                    c.fillStyle = 'rgba(0,0,0,0.7)';
                    c.beginPath();
                    if (c.roundRect) {
                        c.roundRect(el.x - tw / 2 - 6 * S, el.y - el.h - 24 * S,
                            tw + 12 * S, 16 * S, 8 * S);
                    } else {
                        c.rect(el.x - tw / 2 - 6 * S, el.y - el.h - 24 * S,
                            tw + 12 * S, 16 * S);
                    }
                    c.fill();
                    c.fillStyle = '#5AD1FF';
                    c.fillText(txt, el.x, el.y - el.h - 16 * S);
                    c.restore();
                }
            }
        }
    };
})()