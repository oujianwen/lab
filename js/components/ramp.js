(function () {
    function parseColor(hex) {
        let s = (hex || '#8a7bcc').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 138, g: 123, b: 204 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function lighten(hex, t) {
        const c = parseColor(hex);
        return '#' + ['r','g','b'].map(k =>
            Math.round(c[k] + (255 - c[k]) * t).toString(16).padStart(2, '0')).join('');
    }
    function darken(hex, t) {
        const c = parseColor(hex);
        return '#' + ['r','g','b'].map(k =>
            Math.round(c[k] * (1 - t)).toString(16).padStart(2, '0')).join('');
    }
    function distToSeg(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    }

    return {
        type: 'ramp',
        label: '斜坡',
        icon: '📐',
        category: 'mechanical',
        color: '#8a7bcc',

        defaults() {
            return {
                x: 300, y: 620,
                angle: Math.PI / 6,
                length: 260,
                thickness: 18,
                friction: 0.1,
                color: '#8a7bcc',
                showTicks: true
            };
        },

        getPosition(el) {
            const bx = el.x + Math.cos(el.angle) * el.length;
            const by = el.y - Math.sin(el.angle) * el.length;
            return { x: (el.x + bx) / 2, y: (el.y + by) / 2 };
        },
        setPosition(el, cx, cy) {
            const p = this.getPosition(el);
            const dx = cx - p.x, dy = cy - p.y;
            el.x += dx; el.y += dy;
        },
        getRadius(el, env) { return el.length / 2 + 30 * (env && env.S ? env.S : 1); },
        hitTest(el, p, env) {
            const S = (env && env.S) ? env.S : 1;
            const bx = el.x + Math.cos(el.angle) * el.length;
            const by = el.y - Math.sin(el.angle) * el.length;
            return distToSeg(p.x, p.y, el.x, el.y, bx, by) < el.thickness / 2 + 15 * S;
        },
        getHandles(el) {
            const bx = el.x + Math.cos(el.angle) * el.length;
            const by = el.y - Math.sin(el.angle) * el.length;
            return [
                { id: 'A', x: el.x, y: el.y },
                { id: 'B', x: bx, y: by }
            ];
        },
        onHandleDrag(el, handleId, p) {
            if (handleId === 'A') {
                el.x = p.x; el.y = p.y;
            } else if (handleId === 'B') {
                const dx = p.x - el.x;
                const dy = p.y - el.y;
                el.length = Math.max(40, Math.hypot(dx, dy));
                el.angle = Math.atan2(-dy, dx);
            }
        },

        properties: [
            { key: 'x', label: '底端X', type: 'number' },
            { key: 'y', label: '底端Y', type: 'number' },
            { key: 'angle', label: '角度°', type: 'number', step: 5, radians: true },
            { key: 'length', label: '长度', type: 'number', min: 40, max: 800 },
            { key: 'thickness', label: '厚度', type: 'number', min: 4, max: 60 },
            { key: 'friction', label: '摩擦系数', type: 'number', step: 0.01, min: 0, max: 0.8 },
            { key: 'color', label: '颜色', type: 'color' },
            { key: 'showTicks', label: '显示刻度', type: 'checkbox' }
        ],

        render: {
            main(el, scene, env) {
                const c = env.ctx;
                const S = (env && env.S) ? env.S : 1;
                const bx = el.x + Math.cos(el.angle) * el.length;
                const by = el.y - Math.sin(el.angle) * el.length;
                const cx = (el.x + bx) / 2;
                const cy = (el.y + by) / 2;
                const screenAngle = Math.atan2(by - el.y, bx - el.x);

                c.save();
                c.translate(cx, cy);
                c.rotate(screenAngle);

                const L = el.length;
                const T = el.thickness;
                const dark = darken(el.color, 0.4);
                const light = lighten(el.color, 0.3);

                const grad = c.createLinearGradient(0, -T / 2, 0, T / 2);
                grad.addColorStop(0, light);
                grad.addColorStop(0.5, el.color);
                grad.addColorStop(1, dark);
                c.fillStyle = grad;
                c.fillRect(-L / 2, -T / 2, L, T);

                c.strokeStyle = dark;
                c.lineWidth = 2 * S;
                c.strokeRect(-L / 2, -T / 2, L, T);

                c.strokeStyle = 'rgba(255,255,255,0.6)';
                c.lineWidth = 1.5 * S;
                c.beginPath();
                c.moveTo(-L / 2 + 4 * S, -T / 2 + 2 * S);
                c.lineTo(L / 2 - 4 * S, -T / 2 + 2 * S);
                c.stroke();

                if (el.showTicks) {
                    c.strokeStyle = 'rgba(255,255,255,0.45)';
                    c.lineWidth = 1 * S;
                    const step = 40;
                    for (let s = 0; s <= L; s += step) {
                        const px = -L / 2 + s;
                        const tickH = (Math.round(s / step) % 5 === 0) ? 10 : 6;
                        c.beginPath();
                        c.moveTo(px, -T / 2);
                        c.lineTo(px, -T / 2 + tickH * S);
                        c.stroke();
                    }
                }

                c.restore();

                c.save();
                c.translate(el.x, el.y);
                c.font = `bold ${12 * S}px system-ui, sans-serif`;
                c.textAlign = 'left';
                c.textBaseline = 'top';
                const deg = (el.angle * 180 / Math.PI).toFixed(0);
                c.fillStyle = 'rgba(138,123,204,0.95)';
                c.fillText(`θ=${deg}°  μ=${el.friction.toFixed(2)}`, 10 * S, 6 * S);
                c.restore();
            }
        }
    };
})()