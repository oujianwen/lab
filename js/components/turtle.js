(function () {
    function parseColor(hex) {
        let s = (hex || '#3f9e5a').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 63, g: 158, b: 90 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mix(hex, target, t) {
        const A = parseColor(hex), B = parseColor(target);
        return '#' + ['r', 'g', 'b'].map(k =>
            Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
    }
    return {
        type: 'turtle',
        label: '乌龟',
        icon: '🐢',
        category: 'other',
        color: '#3f9e5a',

        defaults() { return { x: 200, y: 300, size: 1, color: '#3f9e5a', _progress: 0, _state: 'idle' }; },

        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) { el.x = x; el.y = y; },
        getRadius(el, env) { return 34 * env.S * (el.size || 1); },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'size', label: '大小', type: 'number', step: 0.1, min: 0.5, max: 2.5 },
            { key: 'color', label: '龟壳', type: 'color' }
        ],

        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S, time = env.time;
                const size = el.size || 1;
                const w = 60 * S * size, h = 40 * S * size;
                const run = el._state === 'run';
                const bob = run ? Math.sin(time * 8) * 1.5 * S : Math.sin(time * 2) * 0.6 * S;

                c.save();
                c.translate(el.x, el.y + bob);

                // 影子
                c.globalAlpha = 0.28; c.fillStyle = '#000';
                c.beginPath(); c.ellipse(0, h * 0.5, w * 0.5, 5 * S * size, 0, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;

                // 腿
                const lp = run ? Math.sin(time * 12) * 5 * S * size : 0;
                c.fillStyle = mix(el.color, '#000000', 0.25);
                for (const sx of [-w * 0.28, w * 0.24]) {
                    c.beginPath();
                    c.ellipse(sx, h * 0.34 + (sx < 0 ? lp : -lp) * 0.3, 8 * S * size, 5 * S * size, 0, 0, Math.PI * 2);
                    c.fill();
                }

                // 尾巴
                c.beginPath();
                c.moveTo(-w * 0.44, 0); c.lineTo(-w * 0.56, h * 0.06); c.lineTo(-w * 0.44, h * 0.12);
                c.closePath(); c.fillStyle = mix(el.color, '#000', 0.2); c.fill();

                // 龟壳主体
                c.beginPath(); c.ellipse(0, -h * 0.05, w * 0.46, h * 0.42, 0, 0, Math.PI * 2);
                const g = c.createLinearGradient(-w * 0.3, -h * 0.4, w * 0.3, h * 0.3);
                g.addColorStop(0, mix(el.color, '#ffffff', 0.35));
                g.addColorStop(1, mix(el.color, '#000000', 0.4));
                c.fillStyle = g; c.fill();
                c.strokeStyle = mix(el.color, '#000000', 0.55); c.lineWidth = 2 * S; c.stroke();

                // 壳纹（六边形格）
                c.strokeStyle = mix(el.color, '#000000', 0.4); c.lineWidth = 1.2 * S;
                for (const o of [[0, -h * 0.28], [-w * 0.18, -h * 0.08], [w * 0.18, -h * 0.08], [0, h * 0.06]]) {
                    c.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = k / 6 * Math.PI * 2 + Math.PI / 6;
                        const px = o[0] + Math.cos(a) * 7 * S * size, py = o[1] + Math.sin(a) * 7 * S * size;
                        k ? c.lineTo(px, py) : c.moveTo(px, py);
                    }
                    c.closePath(); c.stroke();
                }

                // 头（朝右 = 终点方向）
                const hx = w * 0.5, hy = -h * 0.05;
                c.beginPath(); c.ellipse(hx, hy, 11 * S * size, 10 * S * size, 0, 0, Math.PI * 2);
                c.fillStyle = mix(el.color, '#ffffff', 0.15); c.fill();
                c.strokeStyle = mix(el.color, '#000', 0.4); c.lineWidth = 1.5 * S; c.stroke();
                // 眼睛
                c.beginPath(); c.arc(hx + 4 * S * size, hy - 2 * S * size, 1.8 * S * size, 0, Math.PI * 2);
                c.fillStyle = '#1a2030'; c.fill();

                c.restore();

                // 名牌
                c.save();
                c.font = `${11 * S}px system-ui, sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'top';
                c.fillStyle = 'rgba(255,255,255,0.8)';
                c.fillText('乌龟 ' + Math.round((el._progress || 0) * 100) + '%', el.x, el.y + h * 0.5 + 6 * S);
                c.restore();
            }
        }
    };
})()
