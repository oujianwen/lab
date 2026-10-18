(function () {
    function parseColor(hex) {
        let s = (hex || '#8b6a3d').replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return { r: 139, g: 106, b: 61 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    const MATERIALS = {
        towel:  { label: '毛巾',  friction: 0.4,  color: '#c89a6a' },
        wood:   { label: '木板',  friction: 0.15, color: '#8b6a3d' },
        glass:  { label: '玻璃',  friction: 0.05, color: '#a8d8ff' },
        ice:    { label: '冰面',  friction: 0.02, color: '#d0e8ff' },
        custom: { label: '自定义', friction: 0.2,  color: '#888888' }
    };

    return {
        type: 'ground',
        label: '地面',
        icon: '🟫',
        category: 'mechanical',
        color: '#8b6a3d',

        defaults() {
            return {
                x: 500, y: 620,
                length: 900,
                material: 'wood',
                friction: 0.15,
                color: '#8b6a3d'
            };
        },

        getPosition(el) { return { x: el.x, y: el.y }; },
        setPosition(el, x, y) { el.x = x; el.y = y; },
        getRadius(el, env) { return el.length / 2 + 20 * (env && env.S ? env.S : 1); },
        hitTest(el, p, env) {
            const S = (env && env.S) ? env.S : 1;
            return Math.abs(p.y - el.y) < 15 * S &&
                p.x >= el.x - el.length / 2 &&
                p.x <= el.x + el.length / 2;
        },

        properties: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
            { key: 'length', label: '长度', type: 'number', min: 100, max: 2000 },
            { key: 'material', label: '材质', type: 'select',
                options: [
                    { value: 'towel', label: '毛巾（μ=0.4）' },
                    { value: 'wood', label: '木板（μ=0.15）' },
                    { value: 'glass', label: '玻璃（μ=0.05）' },
                    { value: 'ice', label: '冰面（μ=0.02）' },
                    { value: 'custom', label: '自定义' }
                ]
            },
            { key: 'friction', label: '摩擦系数', type: 'number', step: 0.01, min: 0, max: 1 },
            { key: 'color', label: '颜色', type: 'color' }
        ],

        onPropertyChange(el, key, value) {
            if (key === 'material' && MATERIALS[value] && value !== 'custom') {
                el.friction = MATERIALS[value].friction;
                el.color = MATERIALS[value].color;
            }
        },

        render: {
            main(el, scene, env) {
                const c = env.ctx;
                const S = (env && env.S) ? env.S : 1;
                const x1 = el.x - el.length / 2;
                const x2 = el.x + el.length / 2;
                const y = el.y;
                const thick = 20 * S;

                const grad = c.createLinearGradient(0, y, 0, y + thick * 3);
                grad.addColorStop(0, el.color);
                grad.addColorStop(1, 'rgba(30,20,10,0.8)');
                c.fillStyle = grad;
                c.fillRect(x1, y, el.length, thick);

                c.save();
                c.strokeStyle = 'rgba(0,0,0,0.25)';
                c.lineWidth = 1 * S;
                if (el.material === 'towel') {
                    for (let i = 0; i < el.length; i += 8 * S) {
                        const wave = Math.sin(i * 0.3) * 2 * S;
                        c.beginPath();
                        c.moveTo(x1 + i, y + wave);
                        c.lineTo(x1 + i, y + thick + wave);
                        c.stroke();
                    }
                } else if (el.material === 'wood') {
                    for (let i = 0; i < el.length; i += 30 * S) {
                        c.beginPath();
                        c.moveTo(x1 + i, y + 2 * S);
                        c.lineTo(x1 + i + 20 * S, y + thick - 2 * S);
                        c.stroke();
                    }
                } else if (el.material === 'glass' || el.material === 'ice') {
                    c.strokeStyle = 'rgba(255,255,255,0.6)';
                    for (let i = 0; i < el.length; i += 40 * S) {
                        c.beginPath();
                        c.moveTo(x1 + i, y + 3 * S);
                        c.lineTo(x1 + i + 30 * S, y + 3 * S);
                        c.stroke();
                    }
                }
                c.restore();

                c.strokeStyle = 'rgba(255,255,255,0.5)';
                c.lineWidth = 1.5 * S;
                c.beginPath();
                c.moveTo(x1, y + 1 * S);
                c.lineTo(x2, y + 1 * S);
                c.stroke();

                c.save();
                c.font = `bold ${11 * S}px system-ui, sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'top';
                const m = MATERIALS[el.material];
                const label = `${m ? m.label : '地面'} · μ=${el.friction.toFixed(2)}`;
                c.fillStyle = 'rgba(255,255,255,0.85)';
                c.fillText(label, el.x, y + thick + 6 * S);
                c.restore();
            }
        }
    };
})()