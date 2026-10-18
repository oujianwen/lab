(function () {
    function parseColor(hex) {
        let s = (hex || '#eef0f5').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 238, g: 240, b: 245 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function mix(hex, target, t) {
        const A = parseColor(hex), B = parseColor(target);
        return '#' + ['r', 'g', 'b'].map(k =>
            Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
    }
    return {
        type: 'rabbit',
        label: '兔子',
        icon: '🐰',
        category: 'other',
        color: '#eef0f5',

        defaults() { return { x: 200, y: 260, size: 1, color: '#eef0f5', _progress: 0, _state: 'idle', _slept: false, _sleepLeft: 0 }; },

        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) { el.x = x; el.y = y; },
        getRadius(el, env) { return 34 * env.S * (el.size || 1); },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'size', label: '大小', type: 'number', step: 0.1, min: 0.5, max: 2.5 },
            { key: 'color', label: '毛色', type: 'color' }
        ],

        render: {
            main(el, scene, env) {
                const c = env.ctx, S = env.S, time = env.time;
                const size = el.size || 1;
                const w = 52 * S * size, h = 42 * S * size;
                const sleep = el._state === 'sleep';
                const run = el._state === 'run';
                const hop = run ? -Math.abs(Math.sin(time * 14)) * 7 * S * size : 0;

                c.save();
                c.translate(el.x, el.y + hop);

                // 影子
                c.globalAlpha = sleep ? 0.18 : 0.28; c.fillStyle = '#000';
                c.beginPath(); c.ellipse(0, h * 0.5 - hop, w * 0.45, 5 * S * size, 0, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;

                const bodyC = el.color, dark = mix(el.color, '#000', 0.22), pink = '#f4a7bb';

                // 后腿 / 身体
                c.fillStyle = bodyC;
                c.beginPath(); c.ellipse(-w * 0.1, 0, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); c.fill();
                c.strokeStyle = dark; c.lineWidth = 1.5 * S; c.stroke();
                // 尾巴绒球
                c.beginPath(); c.arc(-w * 0.48, h * 0.05, 7 * S * size, 0, Math.PI * 2);
                c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = dark; c.lineWidth = 1 * S; c.stroke();

                // 耳朵
                const earSpread = sleep ? 0.5 : (run ? -0.5 : 0);
                for (const sgn of [-1, 1]) {
                    c.save();
                    c.translate(w * 0.22, -h * 0.4);
                    c.rotate(sgn * 0.25 + earSpread);
                    c.beginPath(); c.ellipse(0, -h * 0.32, 6 * S * size, h * 0.32, 0, 0, Math.PI * 2);
                    c.fillStyle = bodyC; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.4 * S; c.stroke();
                    c.beginPath(); c.ellipse(0, -h * 0.32, 2.6 * S * size, h * 0.22, 0, 0, Math.PI * 2);
                    c.fillStyle = pink; c.fill();
                    c.restore();
                }

                // 头
                const hx = w * 0.24, hy = -h * 0.14;
                c.beginPath(); c.ellipse(hx, hy, 14 * S * size, 12 * S * size, 0, 0, Math.PI * 2);
                c.fillStyle = bodyC; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.5 * S; c.stroke();

                // 脸
                if (sleep) {
                    c.strokeStyle = '#1a2030'; c.lineWidth = 2 * S; c.lineCap = 'round';
                    c.beginPath(); c.arc(hx + 4 * S * size, hy - 1 * S * size, 3 * S * size, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
                    // Zzz
                    c.fillStyle = '#cfe0f7'; c.font = `bold ${12 * S * size}px system-ui, sans-serif`;
                    c.textAlign = 'left'; c.textBaseline = 'bottom';
                    const z = Math.sin(time * 2) * 2 * S;
                    c.fillText('💤', hx + 10 * S * size, hy - 8 * S * size + z);
                } else {
                    c.beginPath(); c.arc(hx + 5 * S * size, hy - 1 * S * size, 2.4 * S * size, 0, Math.PI * 2);
                    c.fillStyle = '#1a2030'; c.fill();
                    // 鼻子 + 胡须
                    c.beginPath(); c.arc(hx + 13 * S * size, hy + 2 * S * size, 1.8 * S * size, 0, Math.PI * 2);
                    c.fillStyle = pink; c.fill();
                    c.strokeStyle = 'rgba(120,120,140,0.7)'; c.lineWidth = 1 * S;
                    for (const dy of [-1, 0, 1]) {
                        c.beginPath(); c.moveTo(hx + 13 * S * size, hy + 2 * S * size);
                        c.lineTo(hx + 24 * S * size, hy + (2 + dy * 3) * S * size); c.stroke();
                    }
                }

                c.restore();

                c.save();
                c.font = `${11 * S}px system-ui, sans-serif`;
                c.textAlign = 'center'; c.textBaseline = 'top';
                c.fillStyle = 'rgba(255,255,255,0.8)';
                const tag = sleep ? '（睡觉中）' : '';
                c.fillText('兔子 ' + Math.round((el._progress || 0) * 100) + '%' + tag, el.x, el.y + h * 0.5 + 6 * S);
                c.restore();
            }
        }
    };
})()
