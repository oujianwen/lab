(function () {
  function parseColor(hex) {
    let s = (hex || '#ff6b8a').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    if (isNaN(n)) return { r: 255, g: 107, b: 138 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mixHex(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return '#' + ['r','g','b'].map(k =>
      Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
  }

  function computeShadow(light, ball, groundY) {
    const lx = light.x, ly = light.y;
    const cx = ball.x, cy = ball.y;
    const r = ball.r;

    if (ly >= groundY - 2) return null;
    if (ly >= cy - r * 0.1) return null;  // 光源必须明显高于球

    const dx = cx - lx, dy = cy - ly;
    const d = Math.hypot(dx, dy);
    if (d <= r * 1.05) return null;

    // 光源方向检查（宽松一点，只要大致朝向球即可）
    const spread = (light.beamSpread || 0) * Math.PI / 180;
    if (spread < Math.PI / 2) {
      const ldx = Math.cos(light.angle || 0);
      const ldy = Math.sin(light.angle || 0);
      const toBallX = cx - lx;
      const toBallY = cy - ly;
      const dot = (toBallX * ldx + toBallY * ldy) / d;
      const cosHalf = Math.cos(spread / 2 + 0.35);
      if (dot < cosHalf) return null;
    }

    const baseAngle = Math.atan2(dy, dx);
    const alpha = Math.asin(Math.min(1, r / d));

    const hits = [];
    for (const da of [-alpha, alpha]) {
      const a = baseAngle + da;
      const sA = Math.sin(a);
      if (Math.abs(sA) < 0.001) continue;
      const t = (groundY - ly) / sA;
      if (t <= 0) continue;
      hits.push(lx + Math.cos(a) * t);
    }
    if (hits.length < 2) return null;

    const x1 = Math.min(hits[0], hits[1]);
    const x2 = Math.max(hits[0], hits[1]);
    if (x2 - x1 < 2) return null;

    const intensity = light.intensity ?? 1;
    const alpha2 = Math.min(0.9, 0.35 + 0.55 * Math.min(intensity, 1.2));
    return { x1, x2, y: groundY, alpha: alpha2 };
  }

  return {
    type: 'ball',
    label: '圆球',
    icon: '🔴',
    category: 'optical',
    color: '#ff6b8a',

    defaults() {
      return {
        x: 400, y: 280,
        r: 45,
        color: '#ff6b8a',
        groundOffset: 22,
        _shadows: [],
        _groundY: 0,
        _hint: '',
        _litFrom: null
      };
    },

    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return el.r + 12 * (env && env.S ? env.S : 1); },

    properties: [
      { key: 'x', label: 'X', type: 'number' },
      { key: 'y', label: 'Y', type: 'number' },
      { key: 'r', label: '半径', type: 'number', min: 10, max: 200 },
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'groundOffset', label: '地面距底%', type: 'range', min: 5, max: 60, scale: 1 }
    ],

    system: {
      update(scene, dt, env) {
        const lights = scene.elements.filter(e =>
          (e.type === 'light' || e.type === 'light_source') && !e.__missing
        );
        for (const el of scene.elements) {
          if (el.type !== 'ball') continue;
          const groundY = env.H * (1 - (el.groundOffset || 22) / 100);
          el._groundY = groundY;

          if (!lights.length) {
            el._shadows = [];
            el._hint = '没有光源，请先放置💡';
            el._litFrom = null;
            continue;
          }

          const shadows = [];
          let preciseCount = 0;
          let anyAbove = false;
          let anyAimed = false;

          for (const light of lights) {
            if (light.y < el.y - el.r * 0.1) anyAbove = true;
            // 方向检查
            const spread = (light.beamSpread || 0) * Math.PI / 180;
            if (spread >= Math.PI / 2) {
              anyAimed = true;
            } else {
              const ldx = Math.cos(light.angle || 0);
              const ldy = Math.sin(light.angle || 0);
              const toX = el.x - light.x;
              const toY = el.y - light.y;
              const d = Math.hypot(toX, toY) || 1;
              if ((toX * ldx + toY * ldy) / d > Math.cos(spread / 2 + 0.35)) {
                anyAimed = true;
              }
            }
            const s = computeShadow(light, el, groundY);
            if (s) { shadows.push(s); preciseCount++; }
          }

          if (preciseCount === 0) {
            if (!anyAbove) {
              el._hint = '↑ 把光源拖到球的上方（y更小）';
            } else if (!anyAimed) {
              el._hint = '↻ 调整光源方向，让它照向球';
            } else {
              // 位置和方向大致对，给个兜底影子保证看得见
              shadows.push({
                x1: el.x - el.r * 1.5,
                x2: el.x + el.r * 1.5,
                y: groundY,
                alpha: 0.28
              });
              el._hint = '≈ 光源偏离较远，效果近似';
            }
          } else {
            el._hint = '';
          }

          for (const s of shadows) {
            s.x1 = Math.max(-50, s.x1);
            s.x2 = Math.min(env.W + 50, s.x2);
          }

          // 找最强的照亮光源，用于球体高光
          let bestLight = null, bestScore = 0;
          for (const light of lights) {
            const toX = el.x - light.x;
            const toY = el.y - light.y;
            const d = Math.hypot(toX, toY) || 1;
            const score = (light.intensity || 1) / d;
            if (score > bestScore && light.y < el.y) {
              bestScore = score;
              bestLight = light;
            }
          }
          el._litFrom = bestLight;
          el._shadows = shadows;
        }
      }
    },

    render: {
      back(el, scene, env) {
        const c = env.ctx;
        const S = env.S;
        const groundY = el._groundY || (env.H * 0.78);

        c.save();
        const g = c.createLinearGradient(0, groundY, 0, env.H);
        g.addColorStop(0, 'rgba(40, 50, 80, 0.55)');
        g.addColorStop(1, 'rgba(10, 15, 30, 0.85)');
        c.fillStyle = g;
        c.fillRect(0, groundY, env.W, env.H - groundY);
        c.strokeStyle = 'rgba(120, 160, 240, 0.35)';
        c.lineWidth = 1.5 * S;
        c.beginPath();
        c.moveTo(0, groundY);
        c.lineTo(env.W, groundY);
        c.stroke();
        c.restore();

        for (const sh of el._shadows || []) {
          const cx = (sh.x1 + sh.x2) / 2;
          const w = Math.max(30 * S, sh.x2 - sh.x1);
          c.save();
          const grd = c.createRadialGradient(cx, groundY, 0, cx, groundY, w / 2);
          grd.addColorStop(0, `rgba(0,0,0,${sh.alpha})`);
          grd.addColorStop(0.7, `rgba(0,0,0,${sh.alpha * 0.65})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = grd;
          c.beginPath();
          c.ellipse(cx, groundY, w / 2, Math.max(6 * S, w * 0.08), 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
      },

      main(el, scene, env) {
        const c = env.ctx;
        const S = env.S;
        c.save();

        // 球体渐变：高光偏向光源方向
        let hx = -0.35, hy = -0.35;
        if (el._litFrom) {
          const dx = el._litFrom.x - el.x;
          const dy = el._litFrom.y - el.y;
          const d = Math.hypot(dx, dy) || 1;
          hx = dx / d * 0.5;
          hy = dy / d * 0.5;
        }
        const g = c.createRadialGradient(
          el.x + hx * el.r, el.y + hy * el.r, el.r * 0.1,
          el.x, el.y, el.r
        );
        g.addColorStop(0, mixHex(el.color, '#ffffff', 0.6));
        g.addColorStop(0.5, el.color);
        g.addColorStop(1, mixHex(el.color, '#000000', 0.6));
        c.fillStyle = g;
        c.beginPath();
        c.arc(el.x, el.y, el.r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = mixHex(el.color, '#000000', 0.65);
        c.lineWidth = 2 * S;
        c.stroke();

        // 高光点（朝光源一侧）
        c.beginPath();
        c.arc(el.x + hx * el.r * 0.7, el.y + hy * el.r * 0.7, el.r * 0.22, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fill();

        // 提示
        if (el._hint) {
          c.font = `bold ${11 * S}px system-ui, sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const text = el._hint;
          const tw = c.measureText(text).width;
          const pad = 7 * S;
          const bx = el.x - tw / 2 - pad;
          const by = el.y + el.r + 8 * S;
          const bw = tw + pad * 2;
          const bh = 20 * S;
          c.fillStyle = 'rgba(255,180,60,0.9)';
          c.beginPath();
          c.roundRect
            ? c.roundRect(bx, by, bw, bh, 9 * S)
            : c.rect(bx, by, bw, bh);
          c.fill();
          c.fillStyle = '#1a1200';
          c.fillText(text, el.x, by + bh / 2 + 1);
        }

        c.restore();
      }
    }
  };
})()