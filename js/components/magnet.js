({
  type: 'magnet',
  label: '磁铁',
  icon: '🧲',
  category: 'mechanical',
  color: '#ff6b8a',

  defaults() {
    return {
      x: 400, y: 400,
      length: 160, height: 50,
      angle: 0,
      polarity: 'NS',
      strength: 1.0,
      pinned: false,
      showFieldLines: false,
      color: '#ff6b8a',
      _vx: 0, _vy: 0,
      _forceX: 0, _forceY: 0,
      _lastDragTime: 0
    };
  },

  getPosition(el) { return { x: el.x, y: el.y }; },
  setPosition(el, x, y) {
    el.x = x; el.y = y;
    el._vx = 0; el._vy = 0;
    el._lastDragTime = performance.now();
  },
  getRadius(el, env) {
    return Math.max(el.length, el.height) / 2 + 30 * env.S;
  },

  getHandles(el) {
    const half = el.length / 2;
    const dx = Math.cos(el.angle) * half;
    const dy = Math.sin(el.angle) * half;
    return [
      { id: 'end1', x: el.x + dx, y: el.y + dy },
      { id: 'end2', x: el.x - dx, y: el.y - dy }
    ];
  },
  onHandleDrag(el, handleId, p) {
    const dx = p.x - el.x;
    const dy = p.y - el.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    if (handleId === 'end1') el.angle = Math.atan2(dy, dx);
    else el.angle = Math.atan2(dy, dx) + Math.PI;
    el._lastDragTime = performance.now();
  },

  properties: [
    { key: 'x', label: 'X', type: 'number' },
    { key: 'y', label: 'Y', type: 'number' },
    { key: 'length', label: '长', type: 'number', min: 40, max: 400, step: 1 },
    { key: 'height', label: '高', type: 'number', min: 20, max: 150, step: 1 },
    { key: 'angle', label: '角度°', type: 'number', step: 5, radians: true },
    { key: 'polarity', label: '极性', type: 'select',
      options: [
        { value: 'NS', label: 'N 在左 S 在右' },
        { value: 'SN', label: 'S 在左 N 在右' }
      ]
    },
    { key: 'strength', label: '磁性', type: 'range', min: 10, max: 300, scale: 100 },
    { key: 'pinned', label: '固定不动', type: 'checkbox' },
    { key: 'showFieldLines', label: '显示磁感线', type: 'checkbox' },
    { key: 'color', label: '颜色', type: 'color' }
  ],

  render: {
    main(el, scene, env) {
      const c = env.ctx;

      function lighten(h, t) {
        let s = (h || '#ff6b8a').replace('#', '');
        if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return '#ff6b8a';
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
          .map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
      }
      function darken(h, t) {
        let s = (h || '#ff6b8a').replace('#', '');
        if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
        const n = parseInt(s, 16);
        if (isNaN(n)) return '#ff6b8a';
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
          .map(v => Math.round(v * (1 - t)).toString(16).padStart(2, '0')).join('');
      }

      c.save();
      c.translate(el.x, el.y);
      c.rotate(el.angle);

      const L = el.length;
      const Hh = el.height;
      const halfL = L / 2;
      const halfH = Hh / 2;
      const r = Math.min(8 * env.S, Hh * 0.22);
      const end1IsN = el.polarity === 'SN';

      // 磁感线
      if (el.showFieldLines) {
        c.save();
        const nX = end1IsN ? halfL : -halfL;
        const sX = end1IsN ? -halfL : halfL;
        c.strokeStyle = `rgba(255,107,138,${Math.min(0.75, 0.15 + 0.25 * el.strength)})`;
        c.lineWidth = 1.2 * env.S;
        for (let i = -3; i <= 3; i++) {
          if (i === 0) continue;
          const outY = i * halfL * 0.4;
          c.beginPath();
          c.moveTo(nX, 0);
          c.quadraticCurveTo(0, outY * 1.5, sX, 0);
          c.stroke();
        }
        c.restore();
      }

      // 磁性光晕
      if (el.strength > 0.01) {
        const glowR = Math.max(L, Hh) * 0.85;
        const g = c.createRadialGradient(0, 0, Hh * 0.5, 0, 0, glowR);
        g.addColorStop(0, `rgba(255,107,138,${0.08 * Math.min(el.strength, 2)})`);
        g.addColorStop(1, 'rgba(255,107,138,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, glowR, 0, Math.PI * 2);
        c.fill();
      }

      const leftColor  = end1IsN ? '#4a90e2' : '#ff4757';
      const rightColor = end1IsN ? '#ff4757' : '#4a90e2';
      const leftLetter  = end1IsN ? 'S' : 'N';
      const rightLetter = end1IsN ? 'N' : 'S';

      // 左半
      c.beginPath();
      c.moveTo(-halfL + r, -halfH);
      c.lineTo(-r, -halfH);
      c.lineTo(-r, halfH);
      c.lineTo(-halfL + r, halfH);
      c.quadraticCurveTo(-halfL, halfH, -halfL, halfH - r);
      c.lineTo(-halfL, -halfH + r);
      c.quadraticCurveTo(-halfL, -halfH, -halfL + r, -halfH);
      c.closePath();
      const lg = c.createLinearGradient(0, -halfH, 0, halfH);
      lg.addColorStop(0, lighten(leftColor, 0.35));
      lg.addColorStop(0.5, leftColor);
      lg.addColorStop(1, darken(leftColor, 0.35));
      c.fillStyle = lg;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 2 * env.S;
      c.stroke();

      // 右半
      c.beginPath();
      c.moveTo(r, -halfH);
      c.lineTo(halfL - r, -halfH);
      c.quadraticCurveTo(halfL, -halfH, halfL, -halfH + r);
      c.lineTo(halfL, halfH - r);
      c.quadraticCurveTo(halfL, halfH, halfL - r, halfH);
      c.lineTo(r, halfH);
      c.closePath();
      const rg = c.createLinearGradient(0, -halfH, 0, halfH);
      rg.addColorStop(0, lighten(rightColor, 0.35));
      rg.addColorStop(0.5, rightColor);
      rg.addColorStop(1, darken(rightColor, 0.35));
      c.fillStyle = rg;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 2 * env.S;
      c.stroke();

      // 顶部高光
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fillRect(-halfL + 8 * env.S, -halfH + 4 * env.S, L - 16 * env.S, halfH * 0.3);

      // 分界线
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 2 * env.S;
      c.beginPath();
      c.moveTo(0, -halfH);
      c.lineTo(0, halfH);
      c.stroke();

      // 字母
      const fontSize = Math.min(Hh * 0.58, 34 * env.S);
      c.font = `bold ${fontSize}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3 * env.S;
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.fillStyle = '#ffffff';
      c.strokeText(leftLetter, -halfL * 0.55, 0);
      c.fillText(leftLetter, -halfL * 0.55, 0);
      c.strokeText(rightLetter, halfL * 0.55, 0);
      c.fillText(rightLetter, halfL * 0.55, 0);

      // 两端旋转手柄提示
      c.fillStyle = 'rgba(94,179,255,0.85)';
      c.beginPath();
      c.arc(halfL - 4 * env.S, 0, 4 * env.S, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(-halfL + 4 * env.S, 0, 4 * env.S, 0, Math.PI * 2);
      c.fill();

      c.restore();

      // 固定标记
      if (el.pinned) {
        c.save();
        c.translate(el.x, el.y - el.height / 2 - 22 * env.S);
        c.fillStyle = 'rgba(255,213,79,0.95)';
        c.beginPath();
        c.arc(0, 0, 7 * env.S, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1.5 * env.S;
        c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath();
        c.arc(0, 0, 2.5 * env.S, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // 磁性强度指示条
      c.save();
      c.translate(el.x, el.y + el.height / 2 + 22 * env.S);
      const barW = el.length * 0.6;
      const barH = 4 * env.S;
      c.fillStyle = 'rgba(255,107,138,0.2)';
      c.fillRect(-barW / 2, -barH / 2, barW, barH);
      const fill = Math.min(1, el.strength / 3);
      if (fill > 0) {
        c.fillStyle = 'rgba(255,107,138,0.85)';
        c.fillRect(-barW / 2, -barH / 2, barW * fill, barH);
      }
      c.restore();
    }
  },

  system: {
    update(scene, dt, env) {
      const now = performance.now();
      const magnets = scene.elements.filter(e => e.type === 'magnet');
      const coins = scene.elements.filter(e => e.type === 'coin' && !e.__missing);
      if (!magnets.length) return;

      for (const m of magnets) {
        if (m._vx == null) m._vx = 0;
        if (m._vy == null) m._vy = 0;
        m._forceX = 0;
        m._forceY = 0;
      }

      const K = 1.2e7;
      const DAMP = 1.8;
      const MAX_SPEED = 2000;
      const MIN_DIST = 40;
      const MAX_RANGE = 1200;

      // 磁铁 ↔ 磁铁
      for (let i = 0; i < magnets.length; i++) {
        for (let j = i + 1; j < magnets.length; j++) {
          const a = magnets[i];
          const b = magnets[j];
          if (a.pinned && b.pinned) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const realDist = Math.hypot(dx, dy);
          if (realDist > MAX_RANGE) continue;

          const r = Math.max(MIN_DIST, realDist);
          const ux = dx / (realDist || 0.001);
          const uy = dy / (realDist || 0.001);

          // 每块磁铁 N 极朝向（单位向量）
          const aSign = a.polarity === 'SN' ? 1 : -1;
          const aNx = Math.cos(a.angle) * aSign;
          const aNy = Math.sin(a.angle) * aSign;
          const bSign = b.polarity === 'SN' ? 1 : -1;
          const bNx = Math.cos(b.angle) * bSign;
          const bNy = Math.sin(b.angle) * bSign;

          // A 面向 B 的极 / B 面向 A 的极
          const aFacing = aNx * ux + aNy * uy;
          const bFacing = -(bNx * ux + bNy * uy);
          const samePole = (aFacing > 0) === (bFacing > 0);
          const fSign = samePole ? -1 : 1;

          const sA = a.strength || 1;
          const sB = b.strength || 1;
          const forceMag = K * sA * sB / (r * r);

          a._forceX += fSign * ux * forceMag;
          a._forceY += fSign * uy * forceMag;
          b._forceX -= fSign * ux * forceMag;
          b._forceY -= fSign * uy * forceMag;
        }
      }

      // 磁铁 → 硬币（不在杯子里的硬币会被吸）
      for (const m of magnets) {
        for (const coin of coins) {
          let inCup = false;
          for (const o of scene.elements) {
            if (o.type !== 'cup') continue;
            if (coin.x >= o.x && coin.x <= o.x + o.w &&
                coin.y >= o.y && coin.y <= o.y + o.h) { inCup = true; break; }
          }
          if (inCup) continue;

          const dx = coin.x - m.x;
          const dy = coin.y - m.y;
          const realDist = Math.hypot(dx, dy);
          if (realDist < 30 * env.S) continue;
          if (realDist > MAX_RANGE) continue;
          const r = Math.max(MIN_DIST, realDist);
          const ux = dx / realDist;
          const uy = dy / realDist;
          const s = m.strength || 1;
          const forceMag = K * s * 0.5 / (r * r);
          if (coin._vx == null) coin._vx = 0;
          if (coin._vy == null) coin._vy = 0;
          coin._vx += ux * forceMag * dt;
          coin._vy += uy * forceMag * dt;
        }
      }

      // 积分磁铁
      for (const m of magnets) {
        if (m.pinned) { m._vx = 0; m._vy = 0; continue; }
        if (now - (m._lastDragTime || 0) < 100) { m._vx = 0; m._vy = 0; continue; }

        m._vx += m._forceX * dt;
        m._vy += m._forceY * dt;
        const damp = Math.exp(-DAMP * dt);
        m._vx *= damp;
        m._vy *= damp;

        const sp = Math.hypot(m._vx, m._vy);
        if (sp > MAX_SPEED) {
          m._vx = m._vx / sp * MAX_SPEED;
          m._vy = m._vy / sp * MAX_SPEED;
        }

        m.x += m._vx * dt;
        m.y += m._vy * dt;

        const pad = 60 * env.S;
        m.x = Math.max(pad, Math.min(env.W - pad, m.x));
        m.y = Math.max(pad, Math.min(env.H - pad, m.y));

        if (Math.hypot(m._vx, m._vy) < 1.5) { m._vx = 0; m._vy = 0; }
      }

      // 积分硬币
      for (const coin of coins) {
        if (coin._vx == null || coin._vy == null) continue;
        const damp = Math.exp(-DAMP * dt);
        coin._vx *= damp;
        coin._vy *= damp;
        coin.x += coin._vx * dt;
        coin.y += coin._vy * dt;
        if (Math.hypot(coin._vx, coin._vy) < 1.5) { coin._vx = 0; coin._vy = 0; }
      }
    }
  }
})